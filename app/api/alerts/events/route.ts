import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        ae.id::text,
        ae.alert_rule_id::text,
        ar.name AS rule_name,
        ar.priority,
        ar.source_type,
        ar.metric_key,
        ae.farm_controller_id::text,
        fr.farm_name,
        ae.status,
        ae.first_triggered_at,
        ae.last_triggered_at,
        ae.active_at,
        ae.resolved_at,
        ae.acknowledged_at,
        ae.latest_value,
        ae.context_json,
        ae.created_at,
        ae.updated_at
      FROM alert_events ae
      JOIN alert_rules ar ON ar.id = ae.alert_rule_id
      LEFT JOIN farm_registry fr ON fr.controller_id = ae.farm_controller_id
      ORDER BY
        CASE ae.status
          WHEN 'active' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'suppressed' THEN 3
          WHEN 'resolved' THEN 4
          ELSE 5
        END,
        ae.updated_at DESC
      LIMIT 100;
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
        error: error instanceof Error ? error.message : "Unknown alert events error",
      },
      { status: 500 },
    );
  }
}
