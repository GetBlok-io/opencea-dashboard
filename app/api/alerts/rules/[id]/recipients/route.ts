import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const AssignmentSchema = z.object({
  recipient_ids: z.array(z.union([z.string(), z.number()])).default([]),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await pool.query(
      `
        SELECT
          arr.id::text AS assignment_id,
          arr.enabled AS assignment_enabled,
          ar.id::text AS recipient_id,
          ar.name,
          ar.recipient_type,
          ar.enabled AS recipient_enabled,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', arc.id::text,
                'channel_type', arc.channel_type,
                'destination', arc.destination,
                'enabled', arc.enabled,
                'priority_minimum', arc.priority_minimum
              )
              ORDER BY arc.channel_type, arc.destination
            ) FILTER (WHERE arc.id IS NOT NULL),
            '[]'::jsonb
          ) AS channels
        FROM alert_rule_recipients arr
        JOIN alert_recipients ar
          ON ar.id = arr.alert_recipient_id
        LEFT JOIN alert_recipient_channels arc
          ON arc.alert_recipient_id = ar.id
        WHERE arr.alert_rule_id = $1
        GROUP BY arr.id, ar.id
        ORDER BY ar.name ASC;
      `,
      [id],
    );

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown rule recipient list error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const client = await pool.connect();

  try {
    const { id } = await context.params;
    const body = AssignmentSchema.parse(await request.json());
    const recipientIds = body.recipient_ids.map(String);

    await client.query("BEGIN");

    await client.query(
      `
        DELETE FROM alert_rule_recipients
        WHERE alert_rule_id = $1;
      `,
      [id],
    );

    for (const recipientId of recipientIds) {
      await client.query(
        `
          INSERT INTO alert_rule_recipients (
            alert_rule_id,
            alert_recipient_id,
            enabled
          )
          VALUES ($1, $2, true)
          ON CONFLICT (alert_rule_id, alert_recipient_id)
          DO UPDATE SET enabled = EXCLUDED.enabled;
        `,
        [id, recipientId],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      rule_id: id,
      recipient_ids: recipientIds,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown rule recipient assignment error",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}
