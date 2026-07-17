import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const RecipientChannelSchema = z.object({
  channel_type: z.enum(["email", "sms"]),
  destination: z.string().min(1),
  enabled: z.boolean().default(true),
  priority_minimum: z.enum(["info", "warning", "critical", "emergency"]).default("info"),
  quiet_hours_json: z.record(z.string(), z.unknown()).nullable().optional(),
});

const UpdateRecipientSchema = z.object({
  name: z.string().min(1),
  recipient_type: z.enum(["person", "role", "group"]),
  enabled: z.boolean(),
  notes: z.string().nullable().optional(),
  channels: z.array(RecipientChannelSchema),
});

async function loadRecipient(id: string) {
  const result = await pool.query(
    `
      SELECT
        ar.id::text,
        ar.name,
        ar.recipient_type,
        ar.enabled,
        ar.notes,
        ar.created_at,
        ar.updated_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', arc.id::text,
              'channel_type', arc.channel_type,
              'destination', arc.destination,
              'enabled', arc.enabled,
              'priority_minimum', arc.priority_minimum,
              'quiet_hours_json', arc.quiet_hours_json
            )
            ORDER BY arc.channel_type, arc.destination
          ) FILTER (WHERE arc.id IS NOT NULL),
          '[]'::jsonb
        ) AS channels
      FROM alert_recipients ar
      LEFT JOIN alert_recipient_channels arc
        ON arc.alert_recipient_id = ar.id
      WHERE ar.id = $1
      GROUP BY ar.id;
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const recipient = await loadRecipient(id);

    if (!recipient) {
      return NextResponse.json(
        { ok: false, error: "Alert recipient not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: recipient,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert recipient read error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const client = await pool.connect();

  try {
    const { id } = await context.params;
    const body = UpdateRecipientSchema.parse(await request.json());

    await client.query("BEGIN");

    const existingResult = await client.query(
      "SELECT id FROM alert_recipients WHERE id = $1 FOR UPDATE;",
      [id],
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: "Alert recipient not found" },
        { status: 404 },
      );
    }

    await client.query(
      `
        UPDATE alert_recipients
        SET
          name = $2,
          recipient_type = $3,
          enabled = $4,
          notes = $5,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [
        id,
        body.name,
        body.recipient_type,
        body.enabled,
        body.notes ?? null,
      ],
    );

    await client.query(
      "DELETE FROM alert_recipient_channels WHERE alert_recipient_id = $1;",
      [id],
    );

    for (const channel of body.channels) {
      await client.query(
        `
          INSERT INTO alert_recipient_channels (
            alert_recipient_id,
            channel_type,
            destination,
            enabled,
            priority_minimum,
            quiet_hours_json
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb);
        `,
        [
          id,
          channel.channel_type,
          channel.destination,
          channel.enabled,
          channel.priority_minimum,
          JSON.stringify(channel.quiet_hours_json ?? null),
        ],
      );
    }

    await client.query("COMMIT");

    const recipient = await loadRecipient(id);

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: recipient,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert recipient update error",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}
