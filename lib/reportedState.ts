import { pool } from "./db";
import { FarmSelection, farmFilterSql } from "./farms";

export type ModuleListEntry = {
  alias_key: string;
  module_id: string;
  io_key: string | null;
  io_override: string | null;
  display_name: string;
  zone: string | null;
  aliased_zone: string | null;
  display_order: number;
  module_type: string | null;
};

export type ReportedStateRow = {
  id: number;
  source_url: string;
  scraped_at: string;
  device_id: string;
  device_type: string;
  device_last_update_epoch: number | null;
  device_last_update_at: string | null;
  connected: boolean | null;
  state: Record<string, unknown>;
  mode: Record<string, unknown>;
  shadow: Record<string, unknown>;
  module_name: string | null;
  module_mappings: ModuleListEntry[];
};

export async function getLatestReportedState(selection?: FarmSelection): Promise<ReportedStateRow[]> {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (rs.device_id)
        rs.id,
        rs.source_url,
        rs.scraped_at,
        rs.device_id,
        rs.device_type,
        rs.device_last_update_epoch,
        rs.device_last_update_at,
        rs.connected,
        rs.state,
        rs.mode,
        rs.shadow
      FROM reported_state rs
      WHERE TRUE
        ${farmFilterSql("rs")}
      ORDER BY
        rs.device_id,
        (rs.connected IS TRUE) DESC,
        rs.device_last_update_at DESC NULLS LAST,
        rs.scraped_at DESC
    )
    SELECT
      latest.id,
      latest.source_url,
      latest.scraped_at,
      latest.device_id,
      latest.device_type,
      latest.device_last_update_epoch,
      latest.device_last_update_at,
      latest.connected,
      latest.state,
      latest.mode,
      latest.shadow,
      NULLIF(module_names.display_name, '') AS module_name,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'alias_key', ml.alias_key,
            'module_id', ml.module_id,
            'io_key', ml.io_key,
            'io_override', ml.io_override,
            'display_name', ml.display_name,
            'zone', ml.zone,
            'aliased_zone', ml.aliased_zone,
            'display_order', ml.display_order,
            'module_type', ml.module_type
          )
          ORDER BY
            CASE COALESCE(ml.zone, '')
              WHEN 'Container' THEN 1
              WHEN 'Nursery' THEN 2
              WHEN 'Cultivation' THEN 3
              ELSE 9
            END,
            ml.display_order ASC,
            ml.display_name ASC
        ) FILTER (WHERE ml.id IS NOT NULL AND ml.io_key IS NOT NULL),
        '[]'::jsonb
      ) AS module_mappings
    FROM latest
    LEFT JOIN module_list ml
      ON ml.module_id = latest.device_id
      AND ml.io_key IS NOT NULL
    LEFT JOIN module_list module_names
      ON module_names.module_id = latest.device_id
      AND module_names.io_key IS NULL
      AND module_names.display_name <> ''
    GROUP BY
      latest.id,
      latest.source_url,
      latest.scraped_at,
      latest.device_id,
      latest.device_type,
      latest.device_last_update_epoch,
      latest.device_last_update_at,
      latest.connected,
      latest.state,
      latest.mode,
      latest.shadow,
      module_names.display_name
    ORDER BY latest.device_id;
  `;

  const result = await pool.query(sql, [selection?.controllerId ?? null, selection?.groupId ?? null]);
  return result.rows;
}
