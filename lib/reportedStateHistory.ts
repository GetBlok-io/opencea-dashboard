import { pool } from "./db";

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
  device_type: string;
  sampled_at: string;
  value: number;
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

export async function getReportedStateHistory(hours = 24): Promise<ReportedStateHistoryPoint[]> {
  const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 168) : 24;
  const maxSamplesPerAlias = 288;

  const sql = `
    WITH mapped_points AS (
      SELECT
        ml.alias_key,
        ml.display_name,
        ml.zone,
        ml.io_key,
        rs.device_id AS module_id,
        rs.device_type,
        COALESCE(rs.device_last_update_at, rs.scraped_at) AS sampled_at,
        (rs.state ->> ml.io_key)::double precision AS value
      FROM reported_state rs
      JOIN module_list ml
        ON ml.module_id = rs.device_id
        AND ml.io_key IS NOT NULL
      WHERE ml.alias_key = ANY($1::text[])
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
      WHERE sampled_at >= NOW() - ($2::int * INTERVAL '1 hour')
    ),
    latest_fallback AS (
      SELECT *
      FROM ranked_recent
      WHERE sample_rank <= $3::int
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
      device_type,
      sampled_at,
      value
    FROM selected
    ORDER BY alias_key, sampled_at ASC
    LIMIT 6000;
  `;

  const result = await pool.query(sql, [DEFAULT_ALIASES, safeHours, maxSamplesPerAlias]);
  return result.rows;
}
