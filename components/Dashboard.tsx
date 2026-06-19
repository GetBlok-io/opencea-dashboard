"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type ApiResponse = {
  ok: boolean;
  count?: number;
  generated_at?: string;
  data?: ReportedStateRow[];
  error?: string;
};

function formatValue(value: unknown) {
  if (typeof value === "number") {
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

function getPrimaryMetrics(row: ReportedStateRow) {
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

  const entries = Object.entries(row.state ?? {});
  const sorted = entries.sort(([a], [b]) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return sorted.slice(0, 8);
}

function DeviceCard({ row }: { row: ReportedStateRow }) {
  const metrics = getPrimaryMetrics(row);

  return (
    <article className="device-card">
      <div className="device-card-header">
        <div>
          <p className="device-type">{row.device_type}</p>
          <h2>{row.device_id}</h2>
        </div>
        <span className={row.connected ? "status online" : "status offline"}>
          {row.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <p className="timestamp">Updated: {formatDate(row.device_last_update_at)}</p>

      <div className="metric-grid">
        {metrics.map(([key, value]) => (
          <div className="metric" key={key}>
            <span>{key}</span>
            <strong>{formatValue(value)}</strong>
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
          <p className="eyebrow">Reported State Dashboard</p>
          <h1>Farm device telemetry</h1>
          <p className="hero-copy">
            Live view of the latest row per device from the PostgreSQL reported_state table.
          </p>
        </div>
        <button onClick={refresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh now"}
        </button>
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
          <DeviceCard key={row.device_id} row={row} />
        ))}
      </section>
    </main>
  );
}
