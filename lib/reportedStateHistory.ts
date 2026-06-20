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

  const sql = `
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
    WHERE rs.connected IS TRUE
      AND COALESCE(rs.device_last_update_at, rs.scraped_at) >= NOW() - ($1::int * INTERVAL '1 hour')
      AND ml.alias_key = ANY($2::text[])
      AND rs.state ? ml.io_key
      AND (rs.state ->> ml.io_key) ~ '^-?[0-9]+(\\.[0-9]+)?$'
    ORDER BY ml.alias_key, sampled_at ASC
    LIMIT 6000;
  `;

  const result = await pool.query(sql, [safeHours, DEFAULT_ALIASES]);
  return result.rows;
}
