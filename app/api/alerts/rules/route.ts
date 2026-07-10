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
        ar.updated_at
      FROM alert_rules ar
      LEFT JOIN farm_registry fr ON fr.controller_id = ar.farm_controller_id
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
