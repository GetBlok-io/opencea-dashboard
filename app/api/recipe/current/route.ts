import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { resolveFarmSelection } from "@/lib/farms";

type ConfigSnapshotRow = {
  config_name: string;
  source_filename: string;
  captured_at: string;
  payload_updated_at: string | null;
  payload_recipe_id: string | null;
  payload_recipe_name: string | null;
  config_payload: Record<string, unknown>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selection = await resolveFarmSelection(searchParams.get("controller_id") ?? searchParams.get("farm"));

    const sql = `
      SELECT DISTINCT ON (config_name)
        config_name,
        source_filename,
        captured_at,
        payload_updated_at,
        payload_recipe_id,
        payload_recipe_name,
        config_payload
      FROM farm_config_snapshot
      WHERE config_name IN (
        'global_settings',
        'local_settings',
        'programming_rules',
        'programming_actions',
        'programming_modes'
      )
        AND ($1::uuid IS NULL OR controller_id = $1::uuid)
      ORDER BY config_name, captured_at DESC;
    `;

    const result = await pool.query<ConfigSnapshotRow>(sql, [selection.controllerId]);
    const configs = Object.fromEntries(result.rows.map((row) => [row.config_name, row]));

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      selected_farm: selection,
      count: result.rowCount,
      configs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        generated_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown recipe API error",
      },
      { status: 500 },
    );
  }
}
