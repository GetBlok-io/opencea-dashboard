import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

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
