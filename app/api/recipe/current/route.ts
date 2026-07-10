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

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function configFrom(
  row: ConfigSnapshotRow,
  configName: string,
  payload: Record<string, unknown>,
): ConfigSnapshotRow {
  return {
    ...row,
    config_name: configName,
    config_payload: payload,
  };
}

function buildRecipeConfigs(rows: ConfigSnapshotRow[]) {
  const configs: Record<string, ConfigSnapshotRow> = {};

  for (const row of rows) {
    const payload = getRecord(row.config_payload);

    if (row.config_name === "settings") {
      configs.global_settings = configFrom(
        row,
        "global_settings",
        getRecord(payload.global_settings),
      );
      configs.local_settings = configFrom(
        row,
        "local_settings",
        getRecord(payload.local_settings),
      );
      continue;
    }

    if (row.config_name === "programming") {
      configs.programming_actions = configFrom(
        row,
        "programming_actions",
        getRecord(payload.actions),
      );
      configs.programming_rules = configFrom(
        row,
        "programming_rules",
        getRecord(payload.rules),
      );
      configs.programming_modes = configFrom(
        row,
        "programming_modes",
        getRecord(payload.modes),
      );
      continue;
    }

    configs[row.config_name] = row;
  }

  return configs;
}

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
        'settings',
        'programming',
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
    const configs = buildRecipeConfigs(result.rows);

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      selected_farm: selection,
      count: Object.keys(configs).length,
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
