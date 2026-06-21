import { pool } from "./db";

export type FarmOption = {
  controller_id: string;
  group_id: string | null;
  farm_name: string;
  config_type: string | null;
  label: string;
  value: string;
};

export type FarmSelection = {
  controllerId: string | null;
  groupId: string | null;
};

function normalizeId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listFarmOptions(): Promise<FarmOption[]> {
  const sql = `
    SELECT
      fr.controller_id::text,
      fr.group_id::text,
      fr.farm_name,
      fr.config_type,
      MAX(fcs.captured_at) AS latest_config_at
    FROM farm_registry fr
    LEFT JOIN farm_config_snapshot fcs
      ON fcs.controller_id = fr.controller_id
    GROUP BY
      fr.controller_id,
      fr.group_id,
      fr.farm_name,
      fr.config_type
    ORDER BY
      COALESCE(MAX(fcs.captured_at), fr.updated_at, fr.created_at) DESC,
      fr.farm_name ASC;
  `;

  const result = await pool.query(sql);

  return result.rows.map((row) => {
    const controllerId = String(row.controller_id);
    const farmName = String(row.farm_name || controllerId);

    return {
      controller_id: controllerId,
      group_id: row.group_id ? String(row.group_id) : null,
      farm_name: farmName,
      config_type: row.config_type ? String(row.config_type) : null,
      label: farmName || controllerId,
      value: controllerId,
    };
  });
}

export async function resolveFarmSelection(controllerId?: string | null): Promise<FarmSelection> {
  const normalizedControllerId = normalizeId(controllerId);

  if (normalizedControllerId) {
    const result = await pool.query(
      `
        SELECT controller_id::text, group_id::text
        FROM farm_registry
        WHERE controller_id = $1::uuid
        LIMIT 1;
      `,
      [normalizedControllerId],
    );

    if (result.rows[0]) {
      return {
        controllerId: String(result.rows[0].controller_id),
        groupId: result.rows[0].group_id ? String(result.rows[0].group_id) : null,
      };
    }

    return { controllerId: normalizedControllerId, groupId: null };
  }

  const farms = await listFarmOptions();
  const firstFarm = farms[0];

  return {
    controllerId: firstFarm?.controller_id ?? null,
    groupId: firstFarm?.group_id ?? null,
  };
}

export function farmFilterSql(alias: string) {
  return `
    AND (
      $1::text IS NULL
      OR ${alias}.source_url ILIKE '%' || $1::text || '%'
      OR COALESCE(${alias}.raw_record::text, '') ILIKE '%' || $1::text || '%'
      OR (
        $2::text IS NOT NULL
        AND (
          ${alias}.source_url ILIKE '%' || $2::text || '%'
          OR COALESCE(${alias}.raw_record::text, '') ILIKE '%' || $2::text || '%'
        )
      )
    )
  `;
}
