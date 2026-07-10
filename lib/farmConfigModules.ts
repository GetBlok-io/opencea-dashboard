import { pool } from "./db";
import type { FarmSelection } from "./farms";
import type { ModuleListEntry } from "./reportedState";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown, fallback = 999): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseModuleSnapshot(payload: Record<string, unknown>): ModuleListEntry[] {
  const moduleList = getRecord(payload.module_list);
  const moduleMapping = getRecord(payload.module_mapping);
  const entries: ModuleListEntry[] = [];

  for (const [aliasKey, rawMapping] of Object.entries(moduleMapping)) {
    const mapping = getRecord(rawMapping);

    const moduleId = textValue(mapping.module);
    const ioKey = textValue(mapping.io);
    if (!moduleId || !ioKey) continue;

    const moduleInfo = getRecord(moduleList[moduleId]);

    entries.push({
      alias_key: aliasKey,
      module_id: moduleId,
      io_key: ioKey,
      io_override: textValue(mapping.io_override),
      display_name: textValue(mapping.name) ?? aliasKey,
      zone: textValue(mapping.zone),
      aliased_zone: textValue(mapping.aliased_zone),
      display_order: numberValue(mapping.order),
      module_type: textValue(moduleInfo.type),
    });
  }

  return entries;
}

export async function getFarmModuleMappings(selection?: FarmSelection): Promise<Map<string, ModuleListEntry[]>> {
  const result = await pool.query(
    `
      SELECT config_payload
      FROM farm_config_snapshot
      WHERE config_name = 'modules'
        AND ($1::uuid IS NULL OR controller_id = $1::uuid)
      ORDER BY captured_at DESC
      LIMIT 1;
    `,
    [selection?.controllerId ?? null],
  );

  const payload = getRecord(result.rows[0]?.config_payload);
  const entries = parseModuleSnapshot(payload);

  const map = new Map<string, ModuleListEntry[]>();

  for (const entry of entries) {
    const list = map.get(entry.module_id) ?? [];
    list.push(entry);
    map.set(entry.module_id, list);
  }

  return map;
}
