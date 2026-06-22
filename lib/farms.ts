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

let reportedStateIdentityColumnsPromise: Promise<boolean> | null = null;

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
      fr.config_type,
      fr.updated_at,
      fr.created_at
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

async function reportedStateHasFarmIdentityColumns() {
  if (!reportedStateIdentityColumnsPromise) {
    reportedStateIdentityColumnsPromise = pool
      .query(
        `
          SELECT COUNT(*)::int AS column_count
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'reported_state'
            AND column_name IN ('controller_id', 'group_id');
        `,
      )
      .then((result) => Number(result.rows[0]?.column_count ?? 0) === 2)
      .catch(() => false);
  }

  return reportedStateIdentityColumnsPromise;
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

export async function reportedStateFarmFilterSql(alias: string) {
  const hasIdentityColumns = await reportedStateHasFarmIdentityColumns();

  if (!hasIdentityColumns) {
    return farmFilterSql(alias);
  }

  return `
    AND (
      $1::uuid IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM reported_state farm_identity_probe
        WHERE farm_identity_probe.controller_id IS NOT NULL
          OR farm_identity_probe.group_id IS NOT NULL
      )
      OR ${alias}.controller_id = $1::uuid
      OR ${alias}.source_url ILIKE '%' || $1::text || '%'
      OR COALESCE(${alias}.raw_record::text, '') ILIKE '%' || $1::text || '%'
      OR (
        $2::uuid IS NOT NULL
        AND ${alias}.group_id = $2::uuid
      )
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
