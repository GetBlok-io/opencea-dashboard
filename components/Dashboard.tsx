"use client";

import { useEffect, useMemo, useState } from "react";

type TemperatureUnit = "C" | "F";

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
  key: string;
  label: string;
  value: unknown;
  zone: string | null;
  order: number;
  aliasKey?: string;
};

const TEMP_KEYS = new Set(["temp", "temperature", "water_temperature", "air_temperature"]);

function isTemperatureMetric(key: string, label: string, aliasKey?: string) {
  const normalizedKey = key.toLowerCase();
  const normalizedLabel = label.toLowerCase();
  const normalizedAlias = aliasKey?.toLowerCase() ?? "";

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

function formatValue(value: unknown, metric: Metric, temperatureUnit: TemperatureUnit) {
  if (typeof value === "number") {
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

function formatDate(value: string | null) {
  if (!value) return "No timestamp";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function getPrimaryMetrics(row: ReportedStateRow): Metric[] {
  const preferredOrder = [
    "pH",
    "ec",
    "temp",
    "RH",
    "CO2",
    "analog_1",
    "analog_2",
    "analog_3",
    "analog_4",
    "pump_1",
    "pump_2",
    "pump_3",
    "pump_4",
    "output_1",
    "output_2",
    "output_3",
    "output_4",
  ];

  const mappingsByIo = new Map<string, ModuleListEntry[]>();
  for (const mapping of row.module_mappings ?? []) {
    if (!mapping.io_key) continue;
    const list = mappingsByIo.get(mapping.io_key) ?? [];
    list.push(mapping);
    mappingsByIo.set(mapping.io_key, list);
  }

  const metrics = Object.entries(row.state ?? {}).map(([key, value]) => {
    const mappings = mappingsByIo.get(key) ?? [];
    const mapping = mappings.sort((a, b) => {
      if ((a.zone ?? "") !== (b.zone ?? "")) return (a.zone ?? "").localeCompare(b.zone ?? "");
      return a.display_order - b.display_order;
    })[0];

    return {
      key,
      label: mapping?.display_name ?? key,
      value,
      zone: mapping?.zone ?? null,
      order: mapping?.display_order ?? 999,
      aliasKey: mapping?.alias_key,
    } satisfies Metric;
  });

  return metrics
    .sort((a, b) => {
      if (a.zone && b.zone && a.zone !== b.zone) return a.zone.localeCompare(b.zone);
      if (a.zone && !b.zone) return -1;
      if (!a.zone && b.zone) return 1;

      if (a.order !== b.order) return a.order - b.order;

      const aIndex = preferredOrder.indexOf(a.key);
      const bIndex = preferredOrder.indexOf(b.key);

      if (aIndex === -1 && bIndex === -1) return a.key.localeCompare(b.key);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    })
    .slice(0, 10);
}

function DeviceCard({ row, temperatureUnit }: { row: ReportedStateRow; temperatureUnit: TemperatureUnit }) {
  const metrics = getPrimaryMetrics(row);
  const title = row.module_name || row.device_id;

  return (
    <article className="device-card">
      <div className="device-card-header">
        <div>
          <p className="device-type">{row.device_type}</p>
          <h2>{title}</h2>
          {row.module_name ? <p className="device-id">{row.device_id}</p> : null}
        </div>
        <span className={row.connected ? "status online" : "status offline"}>
          {row.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <p className="timestamp">Updated: {formatDate(row.device_last_update_at)}</p>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <div className="metric" key={metric.key}>
            <span>{metric.label}</span>
            <strong>{formatValue(metric.value, metric, temperatureUnit)}</strong>
            {metric.zone ? <small>{metric.zone}</small> : null}
          </div>
        ))}
      </div>

      <details>
        <summary>View raw state</summary>
        <pre>{JSON.stringify(row.state, null, 2)}</pre>
      </details>
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

  const summary = useMemo(() => {
    const online = rows.filter((row) => row.connected).length;
    const offline = rows.length - online;
    const types = new Set(rows.map((row) => row.device_type)).size;

    return { online, offline, types };
  }, [rows]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Farmhand Dashboard</p>
          <h1>Farm device telemetry</h1>
          <p className="hero-copy">
            Live view of the latest row per device from PostgreSQL, enriched with module names from module_list.
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
          <span>Total devices</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="summary-card">
          <span>Connected</span>
          <strong>{summary.online}</strong>
        </div>
        <div className="summary-card">
          <span>Disconnected</span>
          <strong>{summary.offline}</strong>
        </div>
        <div className="summary-card">
          <span>Device types</span>
          <strong>{summary.types}</strong>
        </div>
      </section>

      <div className="subheader">
        <p>Last refreshed: {formatDate(lastRefresh)}</p>
        <p>Auto-refresh: every {refreshSeconds} seconds</p>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="device-grid">
        {rows.map((row) => (
          <DeviceCard key={row.device_id} row={row} temperatureUnit={temperatureUnit} />
        ))}
      </section>
    </main>
  );
}
