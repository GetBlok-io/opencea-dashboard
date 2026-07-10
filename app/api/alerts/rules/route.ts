import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { AlertRuleConditionSchema } from "@/lib/alerts/types";

export const dynamic = "force-dynamic";

const CreateRuleSchema = z.object({
  farm_controller_id: z.string().uuid().nullable().default(null),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  source_type: z.enum(["monitoring", "control", "recipe"]).default("monitoring"),
  metric_key: z.string().min(1),
  condition_json: AlertRuleConditionSchema,
  soak_seconds: z.number().int().nonnegative().default(0),
  notification_delay_seconds: z.number().int().nonnegative().default(0),
  cooldown_seconds: z.number().int().nonnegative().default(1800),
  priority: z.enum(["info", "warning", "critical", "emergency"]).default("warning"),
  recipient_ids: z.array(z.union([z.string(), z.number()])).default([]),
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        ar.id::text,
        ar.farm_controller_id::text,
        fr.farm_name,
        ar.name,
        ar.description,
        ar.enabled,
        ar.source_type,
        ar.metric_key,
        ar.condition_json,
        ar.soak_seconds,
        ar.notification_delay_seconds,
        ar.cooldown_seconds,
        ar.priority,
        ar.created_at,
        ar.updated_at,
        COALESCE(
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'id', rec.id::text,
              'name', rec.name,
              'recipient_type', rec.recipient_type,
              'enabled', rec.enabled
            )
          ) FILTER (WHERE rec.id IS NOT NULL),
          '[]'::jsonb
        ) AS recipients
      FROM alert_rules ar
      LEFT JOIN farm_registry fr
        ON fr.controller_id = ar.farm_controller_id
      LEFT JOIN alert_rule_recipients arr
        ON arr.alert_rule_id = ar.id
        AND arr.enabled = true
      LEFT JOIN alert_recipients rec
        ON rec.id = arr.alert_recipient_id
      GROUP BY ar.id, fr.farm_name
      ORDER BY ar.enabled DESC, ar.priority DESC, ar.name ASC;
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
        error: error instanceof Error ? error.message : "Unknown alert rules error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();

  try {
    const body = CreateRuleSchema.parse(await request.json());

    await client.query("BEGIN");

    const result = await client.query(
      `
        INSERT INTO alert_rules (
          farm_controller_id,
          name,
          description,
          enabled,
          source_type,
          metric_key,
          condition_json,
          soak_seconds,
          notification_delay_seconds,
          cooldown_seconds,
          priority
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING
          id::text,
          farm_controller_id::text,
          name,
          description,
          enabled,
          source_type,
          metric_key,
          condition_json,
          soak_seconds,
          notification_delay_seconds,
          cooldown_seconds,
          priority,
          created_at,
          updated_at;
      `,
      [
        body.farm_controller_id,
        body.name,
        body.description ?? null,
        body.enabled,
        body.source_type,
        body.metric_key,
        JSON.stringify(body.condition_json),
        body.soak_seconds,
        body.notification_delay_seconds,
        body.cooldown_seconds,
        body.priority,
      ],
    );

    const ruleId = result.rows[0].id;

    for (const recipientId of body.recipient_ids.map(String)) {
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
        [ruleId, recipientId],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert rule create error",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}
