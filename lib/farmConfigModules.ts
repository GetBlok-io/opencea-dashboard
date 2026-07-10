import { pool } from "./db";
import { FarmSelection } from "./farms";
import { ModuleListEntry } from "./reportedState";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function normalizeModuleEntry(value: unknown, fallbackOrder: number): ModuleListEntry | null {
  const record = getRecord(value);

  const aliasKey = textValue(record.alias_key ?? record.aliasKey ?? record.alias);
  const moduleId = textValue(record.module_id ?? record.moduleId ?? record.id);
  const displayName = textValue(record.display_name ?? record.displayName ?? record.name ?? aliasKey);
  const ioKey = textValue(record.io_key ?? record.ioKey ?? record.io);
  const zone = textValue(record.zone);
  const aliasedZone = textValue(record.aliased_zone ?? record.aliasedZone);
  const moduleType = textValue(record.module_type ?? record.moduleType ?? record.type);
  const ioOverride = textValue(record.io_override ?? record.ioOverride);

  if (!aliasKey || !moduleId) return null;

  return {
    alias_key: aliasKey,
    module_id: moduleId,
    io_key: ioKey,
    io_override: ioOverride,
    display_name: displayName ?? aliasKey,
    zone,
    aliased_zone: aliasedZone,
    display_order: numberValue(record.display_order ?? record.displayOrder, fallbackOrder),
    module_type: moduleType,
  };
}

function parseModuleSnapshot(payload: Record<string, unknown>): ModuleListEntry[] {
  const moduleList = getArray(payload.module_list);
  const entries: ModuleListEntry[] = [];

  moduleList.forEach((entry, index) => {
    const normalized = normalizeModuleEntry(entry, index + 1);
    if (normalized) entries.push(normalized);
  });

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
