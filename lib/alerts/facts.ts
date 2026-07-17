import { getLatestReportedState } from "@/lib/reportedState";
import type { FarmSelection } from "@/lib/farms";
import type { AlertFacts, AlertFactValue } from "./types";

function normalizeValue(value: unknown): AlertFactValue {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return null;
}

export async function collectMonitoringFacts(selection?: FarmSelection): Promise<AlertFacts> {
  const rows = await getLatestReportedState(selection);
  const facts: AlertFacts = {};

  for (const row of rows) {
    facts[`device.${row.device_id}.connected`] = row.connected === true;
    facts[`device.${row.device_id}.type`] = row.device_type;

    for (const mapping of row.module_mappings ?? []) {
      if (!mapping.alias_key || !mapping.io_key) continue;

      const value = normalizeValue(row.state?.[mapping.io_key]);
      facts[mapping.alias_key] = value;

      if (mapping.zone) {
        facts[`${mapping.zone}.${mapping.alias_key}`] = value;
      }
    }
  }

  return facts;
}
