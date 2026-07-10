import { pool } from "./db";
import { FarmSelection, reportedStateFarmFilterSql } from "./farms";
import { getFarmModuleMappings } from "./farmConfigModules";
import type { ModuleListEntry } from "./reportedState";

export type HistoryMetricAlias =
  | "air_temperature"
  | "relative_humidity"
  | "co2"
  | "nursery_ph"
  | "nursery_ec"
  | "nursery_water_temperature"
  | "nursery_tank_depth"
  | "cultivation_ph"
  | "cultivation_ec"
  | "cultivation_water_temperature"
  | "cultivation_tank_depth"
  | "cultivation_left_send_pressure"
  | "cultivation_right_send_pressure";

export type ReportedStateHistoryPoint = {
  alias_key: HistoryMetricAlias;
  display_name: string;
  zone: string;
  io_key: string;
  module_id: string;
  controller_id: string | null;
  group_id: string | null;
  device_type: string;
  sampled_at: string;
  value: number;
};

type ReportedStateHistoryRow = {
  device_id: string;
  device_type: string;
  controller_id: string | null;
  group_id: string | null;
  sampled_at: Date | string | null;
  state: Record<string, unknown> | null;
};

const DEFAULT_ALIASES: HistoryMetricAlias[] = [
  "air_temperature",
  "relative_humidity",
  "co2",
  "nursery_ph",
  "nursery_ec",
  "nursery_water_temperature",
  "nursery_tank_depth",
  "cultivation_ph",
  "cultivation_ec",
  "cultivation_water_temperature",
  "cultivation_tank_depth",
  "cultivation_left_send_pressure",
  "cultivation_right_send_pressure",
];

const DEFAULT_ALIAS_SET = new Set<string>(DEFAULT_ALIASES);

function isHistoryMetricAlias(value: string | null | undefined): value is HistoryMetricAlias {
  return Boolean(value && DEFAULT_ALIAS_SET.has(value));
}

function normalizeSampledAt(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

function numericStateValue(state: Record<string, unknown> | null, ioKey: string | null): number | null {
  if (!state || !ioKey) return null;

  const value = state[ioKey];

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function pointKey(point: ReportedStateHistoryPoint) {
  return [
    point.alias_key,
    point.module_id,
    point.io_key,
    point.sampled_at,
  ].join("|");
}

function buildHistoryFromSnapshotMappings(
  rows: ReportedStateHistoryRow[],
  mappingsByModule: Map<string, ModuleListEntry[]>,
  hours: number,
  maxSamplesPerAlias: number,
): ReportedStateHistoryPoint[] {
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const allPoints: ReportedStateHistoryPoint[] = [];

  for (const row of rows) {
    const sampledAt = normalizeSampledAt(row.sampled_at);
    if (!sampledAt) continue;

    const mappings = mappingsByModule.get(row.device_id) ?? [];

    for (const mapping of mappings) {
      if (!isHistoryMetricAlias(mapping.alias_key)) continue;

      const value = numericStateValue(row.state, mapping.io_key);
      if (value === null) continue;

      allPoints.push({
        alias_key: mapping.alias_key,
        display_name: mapping.display_name,
        zone: mapping.zone ?? mapping.aliased_zone ?? "Unknown",
        io_key: mapping.io_key ?? "",
        module_id: row.device_id,
        controller_id: row.controller_id,
        group_id: row.group_id,
        device_type: row.device_type,
        sampled_at: sampledAt,
        value,
      });
    }
  }

  const byAlias = new Map<HistoryMetricAlias, ReportedStateHistoryPoint[]>();

  for (const point of allPoints) {
    const list = byAlias.get(point.alias_key) ?? [];
    list.push(point);
    byAlias.set(point.alias_key, list);
  }

  const selected = new Map<string, ReportedStateHistoryPoint>();

  for (const points of byAlias.values()) {
    const newestFirst = [...points].sort(
      (a, b) => new Date(b.sampled_at).getTime() - new Date(a.sampled_at).getTime(),
    );

    const recentWindow = newestFirst.filter((point) => new Date(point.sampled_at).getTime() >= cutoffMs);
    const latestFallback = newestFirst.slice(0, maxSamplesPerAlias);

    for (const point of [...recentWindow, ...latestFallback]) {
      selected.set(pointKey(point), point);
    }
  }

  return [...selected.values()]
    .sort((a, b) => {
      if (a.alias_key !== b.alias_key) return a.alias_key.localeCompare(b.alias_key);
      return new Date(a.sampled_at).getTime() - new Date(b.sampled_at).getTime();
    })
    .slice(0, 6000);
}

async function getReportedStateHistoryFromSnapshots(
  hours: number,
  selection?: FarmSelection,
): Promise<ReportedStateHistoryPoint[]> {
  const maxSamplesPerAlias = 288;
  const farmFilter = await reportedStateFarmFilterSql("rs");
  const mappingsByModule = await getFarmModuleMappings(selection);

  if (mappingsByModule.size === 0) return [];

  const result = await pool.query(
    `
      SELECT
        rs.device_id,
        rs.device_type,
        CASE WHEN to_jsonb(rs) ? 'controller_id' THEN to_jsonb(rs) ->> 'controller_id' ELSE NULL END AS controller_id,
        CASE WHEN to_jsonb(rs) ? 'group_id' THEN to_jsonb(rs) ->> 'group_id' ELSE NULL END AS group_id,
        COALESCE(rs.device_last_update_at, rs.scraped_at) AS sampled_at,
        rs.state
      FROM reported_state rs
      WHERE TRUE
        ${farmFilter}
        AND rs.state IS NOT NULL
      ORDER BY COALESCE(rs.device_last_update_at, rs.scraped_at) DESC
      LIMIT $3::int;
    `,
    [
      selection?.controllerId ?? null,
      selection?.groupId ?? null,
      50000,
    ],
  );

  return buildHistoryFromSnapshotMappings(
    result.rows as ReportedStateHistoryRow[],
    mappingsByModule,
    hours,
    maxSamplesPerAlias,
  );
}

async function getReportedStateHistoryFromLegacyModuleList(
  hours: number,
  selection?: FarmSelection,
): Promise<ReportedStateHistoryPoint[]> {
  const maxSamplesPerAlias = 288;
  const farmFilter = await reportedStateFarmFilterSql("rs");

  const sql = `
    WITH mapped_points AS (
      SELECT
        ml.alias_key,
        ml.display_name,
        ml.zone,
        ml.io_key,
        rs.device_id AS module_id,
        CASE WHEN to_jsonb(rs) ? 'controller_id' THEN to_jsonb(rs) ->> 'controller_id' ELSE NULL END AS controller_id,
        CASE WHEN to_jsonb(rs) ? 'group_id' THEN to_jsonb(rs) ->> 'group_id' ELSE NULL END AS group_id,
        rs.device_type,
        COALESCE(rs.device_last_update_at, rs.scraped_at) AS sampled_at,
        (rs.state ->> ml.io_key)::double precision AS value
      FROM reported_state rs
      JOIN module_list ml
        ON ml.module_id = rs.device_id
        AND ml.io_key IS NOT NULL
      WHERE ml.alias_key = ANY($3::text[])
        ${farmFilter}
        AND rs.state ? ml.io_key
        AND (rs.state ->> ml.io_key) ~ '^-?[0-9]+(\\.[0-9]+)?$'
    ),
    ranked_recent AS (
      SELECT
        *,
        row_number() OVER (PARTITION BY alias_key ORDER BY sampled_at DESC) AS sample_rank
      FROM mapped_points
      WHERE sampled_at IS NOT NULL
    ),
    recent_window AS (
      SELECT *
      FROM ranked_recent
      WHERE sampled_at >= NOW() - ($4::int * INTERVAL '1 hour')
    ),
    latest_fallback AS (
      SELECT *
      FROM ranked_recent
      WHERE sample_rank <= $5::int
    ),
    selected AS (
      SELECT * FROM recent_window
      UNION
      SELECT * FROM latest_fallback
    )
    SELECT
      alias_key,
      display_name,
      zone,
      io_key,
      module_id,
      controller_id,
      group_id,
      device_type,
      sampled_at,
      value
    FROM selected
    ORDER BY alias_key, sampled_at ASC
    LIMIT 6000;
  `;

  const result = await pool.query(sql, [
    selection?.controllerId ?? null,
    selection?.groupId ?? null,
    DEFAULT_ALIASES,
    hours,
    maxSamplesPerAlias,
  ]);

  return result.rows;
}

export async function getReportedStateHistory(
  hours = 24,
  selection?: FarmSelection,
): Promise<ReportedStateHistoryPoint[]> {
  const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 168) : 24;

  const snapshotRows = await getReportedStateHistoryFromSnapshots(safeHours, selection);
  if (snapshotRows.length > 0) return snapshotRows;

  return getReportedStateHistoryFromLegacyModuleList(safeHours, selection);
}
