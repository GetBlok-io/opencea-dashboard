"use client";

import { useEffect, useMemo, useState } from "react";

type TemperatureUnit = "C" | "F";
type ZoneName = "Container" | "Nursery" | "Cultivation";

type ModuleListEntry = {
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

type ReportedStateRow = {
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

type ApiResponse = {
  ok: boolean;
  count?: number;
  generated_at?: string;
  data?: ReportedStateRow[];
  error?: string;
};

type Metric = {
  id: string;
  key: string;
  label: string;
  value: unknown;
  zone: ZoneName;
  order: number;
  aliasKey?: string;
  deviceId: string;
  deviceType: string;
  updatedAt: string | null;
};

type ZoneGroup = {
  zone: ZoneName;
  metrics: Metric[];
};

const ZONES: ZoneName[] = ["Container", "Nursery", "Cultivation"];
const TEMP_KEYS = new Set(["temp", "temperature", "water_temperature", "air_temperature"]);

const TROUGH_LEVEL_ALIASES = new Set(["top_trough_level", "bottom_trough_level"]);
const TANK_DEPTH_ALIASES = new Set(["nursery_tank_depth", "cultivation_tank_depth"]);
const SEND_PRESSURE_ALIASES = new Set([
  "cultivation_left_send_pressure",
  "cultivation_right_send_pressure",
]);
const LEVEL_STATUS_ALIASES = new Set([
  "nutrient_a_level",
  "nutrient_b_level",
  "ph_down_level",
  "ph_up_level",
  "nursery_nutrient_a",
  "nursery_nutrient_b",
  "nursery_ph_down",
  "nursery_ph_up",
  "cultivation_nutrient_a",
  "cultivation_nutrient_b",
  "cultivation_ph_down",
  "cultivation_ph_up",
]);

function normalizeZone(value: string | null | undefined): ZoneName | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "container") return "Container";
  if (normalized === "nursery") return "Nursery";
  if (normalized === "cultivation") return "Cultivation";
  return null;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isTemperatureMetric(key: string, label: string, aliasKey?: string) {
  const normalizedKey = normalizeText(key);
  const normalizedLabel = normalizeText(label);
  const normalizedAlias = normalizeText(aliasKey);

  return (
    TEMP_KEYS.has(normalizedKey) ||
    normalizedKey.includes("temp") ||
    normalizedLabel.includes("temperature") ||
    normalizedAlias.includes("temperature")
  );
}

function celsiusToFahrenheit(celsius: number) {
  return celsius * (9 / 5) + 32;
}

function isOutputMetric(metric: Metric) {
  return metric.deviceType === "output" || metric.key.toLowerCase().startsWith("output_");
}

function isTroughLevelMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  return TROUGH_LEVEL_ALIASES.has(alias) || label.includes("trough level");
}

function isTankDepthMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  return TANK_DEPTH_ALIASES.has(alias) || label.includes("tank depth");
}

function isSendPressureMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  return SEND_PRESSURE_ALIASES.has(alias) || label.includes("send pressure");
}

function isLevelStatusMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);

  return (
    LEVEL_STATUS_ALIASES.has(alias) ||
    label === "nutrient a" ||
    label === "nutrient b" ||
    label === "nutrient c" ||
    label === "ph down" ||
    label.includes("nutrient a level") ||
    label.includes("nutrient b level") ||
    label.includes("nutrient c level") ||
    label.includes("boost") ||
    label.includes("ph up level") ||
    label.includes("ph down level")
  );
}

function formatPercent(value: number) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded}%`;
}

function formatValue(value: unknown, metric: Metric, temperatureUnit: TemperatureUnit) {
  if (typeof value === "number") {
    if (isTroughLevelMetric(metric)) {
      return value === 1 ? "EMPTY" : "FULL";
    }

    if (isLevelStatusMetric(metric)) {
      return value === 1 ? "LOW" : "OK";
    }

    if (isOutputMetric(metric)) {
      return value === 1 ? "ON" : "OFF";
    }

    if (isTankDepthMetric(metric) || isSendPressureMetric(metric)) {
      return formatPercent(value);
    }

    if (isTemperatureMetric(metric.key, metric.label, metric.aliasKey)) {
      const converted = temperatureUnit === "F" ? celsiusToFahrenheit(value) : value;
      return `${converted.toFixed(1)} °${temperatureUnit}`;
    }

    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return "—";
  }

  return String(value);
}

function valueClass(metric: Metric) {
  if (typeof metric.value !== "number") return undefined;

  if (isLevelStatusMetric(metric) && metric.value === 1) return "alert-value";
  if (isTroughLevelMetric(metric) && metric.value === 1) return "alert-value";
  if (isOutputMetric(metric) && metric.value === 1) return "active-value";

  return undefined;
}

function formatDate(value: string | null) {
  if (!value) return "No timestamp";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function buildZoneGroups(rows: ReportedStateRow[]): ZoneGroup[] {
  const zoneMap = new Map<ZoneName, Metric[]>();
  for (const zone of ZONES) zoneMap.set(zone, []);

  const connectedRows = rows.filter((row) => row.connected === true);

  for (const row of connectedRows) {
    const mappingsByIo = new Map<string, ModuleListEntry[]>();

    for (const mapping of row.module_mappings ?? []) {
      if (!mapping.io_key) continue;
      const zone = normalizeZone(mapping.zone);
      if (!zone) continue;

      const list = mappingsByIo.get(mapping.io_key) ?? [];
      list.push(mapping);
      mappingsByIo.set(mapping.io_key, list);
    }

    for (const [key, value] of Object.entries(row.state ?? {})) {
      const mappings = mappingsByIo.get(key) ?? [];

      for (const mapping of mappings) {
        const zone = normalizeZone(mapping.zone);
        if (!zone) continue;

        zoneMap.get(zone)?.push({
          id: `${row.device_id}:${key}:${mapping.alias_key}`,
          key,
          label: mapping.display_name || key,
          value,
          zone,
          order: mapping.display_order ?? 999,
          aliasKey: mapping.alias_key,
          deviceId: row.device_id,
          deviceType: row.device_type,
          updatedAt: row.device_last_update_at,
        });
      }
    }
  }

  return ZONES.map((zone) => ({
    zone,
    metrics: (zoneMap.get(zone) ?? []).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.label !== b.label) return a.label.localeCompare(b.label);
      return a.deviceId.localeCompare(b.deviceId);
    }),
  }));
}

function ZoneCard({ group, temperatureUnit }: { group: ZoneGroup; temperatureUnit: TemperatureUnit }) {
  const latestUpdate = group.metrics
    .map((metric) => metric.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return (
    <article className="zone-card">
      <div className="zone-card-header">
        <div>
          <p className="zone-kicker">Zone</p>
          <h2>{group.zone}</h2>
        </div>
        <span className="metric-count">{group.metrics.length} values</span>
      </div>

      <p className="timestamp">Updated: {formatDate(latestUpdate)}</p>

      {group.metrics.length > 0 ? (
        <div className="metric-grid">
          {group.metrics.map((metric) => (
            <div className="metric" key={metric.id}>
              <span>{metric.label}</span>
              <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
              <small className="module-id">{metric.deviceId} · {metric.key}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-zone">No connected mapped values found for this zone.</div>
      )}
    </article>
  );
}

export default function Dashboard({ initialRows }: { initialRows: ReportedStateRow[] }) {
  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30");
  const [rows, setRows] = useState<ReportedStateRow[]>(initialRows);
  const [lastRefresh, setLastRefresh] = useState<string>(new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>("C");

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/reported-state/latest", { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? "Failed to load reported state data.");
      }

      setRows(payload.data);
      setLastRefresh(payload.generated_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(refresh, refreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [refreshSeconds]);

  const connectedRows = useMemo(() => rows.filter((row) => row.connected === true), [rows]);
  const zoneGroups = useMemo(() => buildZoneGroups(connectedRows), [connectedRows]);

  const summary = useMemo(() => {
    const mappedValues = zoneGroups.reduce((total, group) => total + group.metrics.length, 0);
    const activeZones = zoneGroups.filter((group) => group.metrics.length > 0).length;
    const types = new Set(connectedRows.map((row) => row.device_type)).size;

    return { connectedDevices: connectedRows.length, mappedValues, activeZones, types };
  }, [connectedRows, zoneGroups]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Farmhand Dashboard</p>
          <h1>Farm zone telemetry</h1>
          <p className="hero-copy">
            Live view of connected Farmhand modules, grouped by Container, Nursery, and Cultivation using the module_list mapping.
          </p>
        </div>
        <div className="hero-actions">
          <div className="toggle-group" aria-label="Temperature unit">
            <button
              className={temperatureUnit === "C" ? "toggle active" : "toggle"}
              onClick={() => setTemperatureUnit("C")}
              type="button"
            >
              °C
            </button>
            <button
              className={temperatureUnit === "F" ? "toggle active" : "toggle"}
              onClick={() => setTemperatureUnit("F")}
              type="button"
            >
              °F
            </button>
          </div>
          <button onClick={refresh} disabled={loading} type="button">
            {loading ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <div className="summary-card">
          <span>Connected modules</span>
          <strong>{summary.connectedDevices}</strong>
        </div>
        <div className="summary-card">
          <span>Mapped values</span>
          <strong>{summary.mappedValues}</strong>
        </div>
        <div className="summary-card">
          <span>Active zones</span>
          <strong>{summary.activeZones}</strong>
        </div>
        <div className="summary-card">
          <span>Module types</span>
          <strong>{summary.types}</strong>
        </div>
      </section>

      <div className="subheader">
        <p>Last refreshed: {formatDate(lastRefresh)}</p>
        <p>Auto-refresh: every {refreshSeconds} seconds</p>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="zone-grid">
        {zoneGroups.map((group) => (
          <ZoneCard key={group.zone} group={group} temperatureUnit={temperatureUnit} />
        ))}
      </section>
    </main>
  );
}
