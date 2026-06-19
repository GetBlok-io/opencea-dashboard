import { pool } from "./db";

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
};

export async function getLatestReportedState(): Promise<ReportedStateRow[]> {
  const sql = `
    SELECT DISTINCT ON (device_id)
      id,
      source_url,
      scraped_at,
      device_id,
      device_type,
      device_last_update_epoch,
      device_last_update_at,
      connected,
      state,
      mode,
      shadow
    FROM reported_state
    ORDER BY device_id, device_last_update_at DESC NULLS LAST, scraped_at DESC;
  `;

  const result = await pool.query(sql);
  return result.rows;
}
