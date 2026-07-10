import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const CreateRecipientSchema = z.object({
  name: z.string().min(1),
  recipient_type: z.enum(["person", "role", "group"]).default("person"),
  enabled: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  channels: z.array(z.object({
    channel_type: z.enum(["email", "sms"]),
    destination: z.string().min(1),
    enabled: z.boolean().default(true),
    priority_minimum: z.enum(["info", "warning", "critical", "emergency"]).default("info"),
    quiet_hours_json: z.record(z.string(), z.unknown()).nullable().optional(),
  })).default([]),
});

export async function GET() {
  try {
    const result = await pool.query(`
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
      GROUP BY ar.id
      ORDER BY ar.enabled DESC, ar.name ASC;
    `);

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
        error: error instanceof Error ? error.message : "Unknown alert recipients error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();

  try {
    const body = CreateRecipientSchema.parse(await request.json());

    await client.query("BEGIN");

    const recipientResult = await client.query(
      `
        INSERT INTO alert_recipients (
          name,
          recipient_type,
          enabled,
          notes
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id::text, name, recipient_type, enabled, notes, created_at, updated_at;
      `,
      [
        body.name,
        body.recipient_type,
        body.enabled,
        body.notes ?? null,
      ],
    );

    const recipientId = recipientResult.rows[0].id;

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
          recipientId,
          channel.channel_type,
          channel.destination,
          channel.enabled,
          channel.priority_minimum,
          JSON.stringify(channel.quiet_hours_json ?? null),
        ],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: recipientResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert recipient create error",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}
