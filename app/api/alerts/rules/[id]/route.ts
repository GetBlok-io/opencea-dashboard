import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { AlertRuleConditionSchema } from "@/lib/alerts/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const UpdateRuleSchema = z.object({
  farm_controller_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  source_type: z.enum(["monitoring", "control", "recipe"]).optional(),
  metric_key: z.string().min(1).optional(),
  condition_json: AlertRuleConditionSchema.optional(),
  soak_seconds: z.number().int().nonnegative().optional(),
  notification_delay_seconds: z.number().int().nonnegative().optional(),
  cooldown_seconds: z.number().int().nonnegative().optional(),
  priority: z.enum(["info", "warning", "critical", "emergency"]).optional(),
  recipient_ids: z.array(z.union([z.string(), z.number()])).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await pool.query(
      `
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
        WHERE ar.id = $1
          AND ar.deleted_at IS NULL
        GROUP BY ar.id, fr.farm_name;
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Alert rule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert rule read error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const client = await pool.connect();

  try {
    const { id } = await context.params;
    const body = UpdateRuleSchema.parse(await request.json());

    await client.query("BEGIN");

    const currentResult = await client.query(
      "SELECT * FROM alert_rules WHERE id = $1 AND deleted_at IS NULL FOR UPDATE;",
      [id],
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: "Alert rule not found" },
        { status: 404 },
      );
    }

    const current = currentResult.rows[0];

    const next = {
      farm_controller_id: body.farm_controller_id === undefined ? current.farm_controller_id : body.farm_controller_id,
      name: body.name ?? current.name,
      description: body.description === undefined ? current.description : body.description,
      enabled: body.enabled ?? current.enabled,
      source_type: body.source_type ?? current.source_type,
      metric_key: body.metric_key ?? current.metric_key,
      condition_json: body.condition_json ?? current.condition_json,
      soak_seconds: body.soak_seconds ?? Number(current.soak_seconds),
      notification_delay_seconds: body.notification_delay_seconds ?? Number(current.notification_delay_seconds),
      cooldown_seconds: body.cooldown_seconds ?? Number(current.cooldown_seconds),
      priority: body.priority ?? current.priority,
    };

    const updateResult = await client.query(
      `
        UPDATE alert_rules
        SET
          farm_controller_id = $2::uuid,
          name = $3,
          description = $4,
          enabled = $5,
          source_type = $6,
          metric_key = $7,
          condition_json = $8::jsonb,
          soak_seconds = $9,
          notification_delay_seconds = $10,
          cooldown_seconds = $11,
          priority = $12,
          updated_at = NOW()
        WHERE id = $1
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
        id,
        next.farm_controller_id,
        next.name,
        next.description,
        next.enabled,
        next.source_type,
        next.metric_key,
        JSON.stringify(next.condition_json),
        next.soak_seconds,
        next.notification_delay_seconds,
        next.cooldown_seconds,
        next.priority,
      ],
    );

    if (body.recipient_ids) {
      const recipientIds = body.recipient_ids.map(String);

      await client.query(
        "DELETE FROM alert_rule_recipients WHERE alert_rule_id = $1;",
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
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: updateResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert rule update error",
      },
      { status: 400 },
    );
  } finally {
    client.release();
  }
}


export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await pool.query(
      `
        UPDATE alert_rules
        SET
          enabled = false,
          deleted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING
          id::text,
          name,
          enabled,
          deleted_at,
          updated_at;
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Alert rule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert rule delete error",
      },
      { status: 400 },
    );
  }
}
