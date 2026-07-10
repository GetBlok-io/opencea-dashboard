"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import RecipeDashboard from "./RecipeDashboard";

type TemperatureUnit = "C" | "F";
type HistoryHours = 1 | 6 | 12 | 24;
type ZoneName = "Container" | "Nursery" | "Cultivation";
type MetricRow = "primary" | "secondary" | "other";
type AppSection = "monitoring" | "control" | "recipe";

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
  selected_farm?: { controllerId: string | null; groupId: string | null };
  data?: ReportedStateRow[];
  error?: string;
};

type HistoryPoint = {
  alias_key: string;
  display_name: string;
  zone: string;
  io_key: string;
  module_id: string;
  device_type: string;
  sampled_at: string;
  value: number;
};

type HistoryApiResponse = {
  ok: boolean;
  count?: number;
  generated_at?: string;
  data?: HistoryPoint[];
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

type ChartDefinition = {
  aliasKey: string;
  title: string;
  subtitle: string;
  unit: string;
  zone: ZoneName;
  kind: "temperature" | "number" | "percent";
};

const ZONES: ZoneName[] = ["Container", "Nursery", "Cultivation"];
const TEMP_KEYS = new Set(["temp", "temperature", "water_temperature", "air_temperature"]);
const TEMPERATURE_UNIT_STORAGE_KEY = "opencea.temperatureUnit";
const HISTORY_HOURS_STORAGE_KEY = "opencea.historyHours";
const LIVE_CHECK_SECONDS = 5;

const HISTORY_RANGES: { hours: HistoryHours; label: string }[] = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 12, label: "12h" },
  { hours: 24, label: "24h" },
];

type LatestTimestampApiResponse = {
  ok: boolean;
  generated_at?: string;
  latest_scraped_at?: string | null;
  error?: string;
};

type FarmOption = {
  controller_id: string;
  group_id: string | null;
  farm_name: string;
  config_type: string | null;
  label: string;
  value: string;
};

type DashboardProps = {
  initialRows: ReportedStateRow[];
  farmOptions?: FarmOption[];
  selectedControllerId?: string | null;
};

function readStoredTemperatureUnit(): TemperatureUnit {
  if (typeof window === "undefined") return "C";
  const stored = window.localStorage.getItem(TEMPERATURE_UNIT_STORAGE_KEY);
  return stored === "F" ? "F" : "C";
}

function readStoredHistoryHours(): HistoryHours {
  if (typeof window === "undefined") return 1;
  const stored = Number(window.localStorage.getItem(HISTORY_HOURS_STORAGE_KEY));
  return HISTORY_RANGES.some((range) => range.hours === stored) ? stored as HistoryHours : 1;
}

function latestScrapedAtFromRows(rows: ReportedStateRow[]) {
  return rows
    .map((row) => row.scraped_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function buildFarmQuery(selectedControllerId?: string | null) {
  const params = new URLSearchParams();
  if (selectedControllerId) params.set("controller_id", selectedControllerId);
  return params;
}

const CHARTS: ChartDefinition[] = [
  { aliasKey: "air_temperature", title: "Air Temperature", subtitle: "Container climate", unit: "°C", zone: "Container", kind: "temperature" },
  { aliasKey: "relative_humidity", title: "Humidity", subtitle: "Container RH", unit: "%", zone: "Container", kind: "percent" },
  { aliasKey: "co2", title: "CO₂", subtitle: "Container ppm", unit: "ppm", zone: "Container", kind: "number" },
  { aliasKey: "nursery_ph", title: "Nursery pH", subtitle: "Root-zone acidity", unit: "pH", zone: "Nursery", kind: "number" },
  { aliasKey: "nursery_ec", title: "Nursery EC", subtitle: "Nutrient strength", unit: "µS/cm", zone: "Nursery", kind: "number" },
  { aliasKey: "nursery_water_temperature", title: "Nursery Water Temperature", subtitle: "Tank water temperature", unit: "°C", zone: "Nursery", kind: "temperature" },
  { aliasKey: "nursery_tank_depth", title: "Nursery Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Nursery", kind: "percent" },
  { aliasKey: "cultivation_ph", title: "Cultivation pH", subtitle: "Root-zone acidity", unit: "pH", zone: "Cultivation", kind: "number" },
  { aliasKey: "cultivation_ec", title: "Cultivation EC", subtitle: "Nutrient strength", unit: "µS/cm", zone: "Cultivation", kind: "number" },
  { aliasKey: "cultivation_water_temperature", title: "Cultivation Water Temperature", subtitle: "Tank water temperature", unit: "°C", zone: "Cultivation", kind: "temperature" },
  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },
  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },
  { aliasKey: "cultivation_right_send_pressure", title: "Right Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },
];

const CONTAINER_PRIMARY_ALIASES = new Set(["air_temperature", "relative_humidity", "co2"]);
const CONTAINER_NUTRIENT_LEVEL_ALIASES = new Set([
  "nutrient_a_level",
  "nutrient_b_level",
  "ph_up_level",
  "ph_down_level",
]);
const WATER_PRIMARY_ALIASES = new Set([
  "nursery_ec",
  "nursery_ph",
  "nursery_water_temperature",
  "cultivation_ec",
  "cultivation_ph",
  "cultivation_water_temperature",
]);
const WATER_SECONDARY_ALIASES = new Set([
  "nursery_tank_depth",
  "cultivation_tank_depth",
  "top_trough_level",
  "bottom_trough_level",
]);
const TROUGH_LEVEL_ALIASES = new Set(["top_trough_level", "bottom_trough_level"]);
const TANK_DEPTH_ALIASES = new Set(["nursery_tank_depth", "cultivation_tank_depth"]);
const SEND_PRESSURE_ALIASES = new Set([
  "cultivation_left_send_pressure",
  "cultivation_right_send_pressure",
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

function isPumpMetric(metric: Metric) {
  const key = normalizeText(metric.key);
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);

  return key.startsWith("pump_") || alias.includes("pump") || label.includes("pump");
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

function isContainerNutrientLevelMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);

  return (
    metric.zone === "Container" &&
    !isPumpMetric(metric) &&
    (
      CONTAINER_NUTRIENT_LEVEL_ALIASES.has(alias) ||
      label.includes("nutrient a level") ||
      label.includes("nutrient b level") ||
      label.includes("nutrient c level") ||
      label.includes("boost") ||
      label.includes("ph up level") ||
      label.includes("ph down level")
    )
  );
}

function formatPercent(value: number) {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded}%`;
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatValue(value: unknown, metric: Metric, temperatureUnit: TemperatureUnit) {
  if (typeof value === "number") {
    if (isTroughLevelMetric(metric)) {
      return value === 1 ? "EMPTY" : "FULL";
    }

    if (isContainerNutrientLevelMetric(metric)) {
      return value === 1 ? "LOW" : "OK";
    }

    if (isPumpMetric(metric) || isOutputMetric(metric)) {
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

  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "—";
  return String(value);
}

function valueClass(metric: Metric) {
  if (typeof metric.value !== "number") return undefined;

  if (isContainerNutrientLevelMetric(metric) && metric.value === 1) return "alert-value";
  if (isTroughLevelMetric(metric) && metric.value === 1) return "alert-value";
  if ((isPumpMetric(metric) || isOutputMetric(metric)) && metric.value === 1) return "active-value";

  return undefined;
}

function isSwitchMetric(metric: Metric) {
  return (
    typeof metric.value === "number" &&
    (isPumpMetric(metric) || isOutputMetric(metric)) &&
    !isContainerNutrientLevelMetric(metric) &&
    !isTroughLevelMetric(metric)
  );
}

function isControlMetric(metric: Metric) {
  return isSwitchMetric(metric);
}

function isChartedMetric(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  return CHARTS.some((chart) => chart.aliasKey === alias);
}

function formatDate(value: string | null) {
  if (!value) return "No timestamp";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function getMetricRow(metric: Metric): MetricRow {
  const alias = normalizeText(metric.aliasKey);

  if (metric.zone === "Container") {
    if (CONTAINER_PRIMARY_ALIASES.has(alias)) return "primary";
    if (isContainerNutrientLevelMetric(metric)) return "secondary";
    return "other";
  }

  if (metric.zone === "Nursery" || metric.zone === "Cultivation") {
    if (WATER_PRIMARY_ALIASES.has(alias)) return "primary";
    if (WATER_SECONDARY_ALIASES.has(alias)) return "secondary";
    return "other";
  }

  return "other";
}

function rowTitle(zone: ZoneName, row: MetricRow) {
  if (zone === "Container") {
    if (row === "primary") return "Farm-wide climate";
    if (row === "secondary") return "Nutrient and pH supply tanks";
    return "Other container controls";
  }

  if (row === "primary") return "Water chemistry";
  if (row === "secondary") return "Trough levels";
  return "Other monitoring values";
}

function metricSortPriority(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  if (alias === "top_trough_level") return 0;
  if (alias === "bottom_trough_level") return 1;
  return 10;
}

function sortMetrics(a: Metric, b: Metric) {
  const priorityDelta = metricSortPriority(a) - metricSortPriority(b);
  if (priorityDelta !== 0) return priorityDelta;
  if (a.order !== b.order) return a.order - b.order;
  if (a.label !== b.label) return a.label.localeCompare(b.label);
  if (a.deviceId !== b.deviceId) return a.deviceId.localeCompare(b.deviceId);
  return a.key.localeCompare(b.key);
}

function buildZoneGroups(rows: ReportedStateRow[]): ZoneGroup[] {
  const zoneMap = new Map<ZoneName, Metric[]>();
  for (const zone of ZONES) zoneMap.set(zone, []);

  const explicitlyConnectedRows = rows.filter((row) => row.connected === true);
  const displayRows = explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;

  for (const row of displayRows) {
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
    metrics: (zoneMap.get(zone) ?? []).sort(sortMetrics),
  }));
}

function getLatestMetricValue(zoneGroups: ZoneGroup[], aliasKey: string) {
  for (const group of zoneGroups) {
    const metric = group.metrics.find((item) => item.aliasKey === aliasKey);
    if (metric && typeof metric.value === "number") return metric.value;
  }
  return null;
}

function formatChartValue(value: number | null, chart: ChartDefinition, temperatureUnit: TemperatureUnit) {
  if (value === null) return "—";
  if (chart.kind === "temperature") {
    const converted = temperatureUnit === "F" ? celsiusToFahrenheit(value) : value;
    return `${converted.toFixed(1)} °${temperatureUnit}`;
  }
  if (chart.kind === "percent") return formatPercent(value);
  return `${formatNumber(value)} ${chart.unit}`;
}

function getChartData(history: HistoryPoint[], chart: ChartDefinition, temperatureUnit: TemperatureUnit) {
  return history
    .filter((point) => point.alias_key === chart.aliasKey)
    .map((point) => ({
      sampledAt: point.sampled_at,
      label: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(point.sampled_at)),
      value: chart.kind === "temperature" && temperatureUnit === "F" ? celsiusToFahrenheit(point.value) : point.value,
    }));
}

function ToggleMetricCard({ metric }: { metric: Metric }) {
  const enabled = Number(metric.value) === 1;

  return (
    <div className="metric switch-metric" key={metric.id}>
      <div>
        <span>{metric.label}</span>
        <small className="module-id">{metric.deviceId} · {metric.key}</small>
      </div>
      <div className="switch-wrap" aria-label={`${metric.label} is ${enabled ? "ON" : "OFF"}`}>
        <span className={enabled ? "switch-label" : "switch-label active-label"}>OFF</span>
        <span className={enabled ? "switch on" : "switch"}>
          <span className="switch-thumb" />
        </span>
        <span className={enabled ? "switch-label active-label" : "switch-label"}>ON</span>
      </div>
    </div>
  );
}

function MetricCard({ metric, temperatureUnit }: { metric: Metric; temperatureUnit: TemperatureUnit }) {
  if (isSwitchMetric(metric)) return <ToggleMetricCard metric={metric} />;

  return (
    <div className="metric" key={metric.id}>
      <span>{metric.label}</span>
      <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
      <small className="module-id">{metric.deviceId} · {metric.key}</small>
    </div>
  );
}

function ChartCard({
  chart,
  history,
  currentValue,
  temperatureUnit,
}: {
  chart: ChartDefinition;
  history: HistoryPoint[];
  currentValue: number | null;
  temperatureUnit: TemperatureUnit;
}) {
  const chartData = getChartData(history, chart, temperatureUnit);
  const unit = chart.kind === "temperature" ? `°${temperatureUnit}` : chart.unit;

  return (
    <article className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>{chart.title}</h3>
          <span>{chart.subtitle}</span>
        </div>
        <strong>{formatChartValue(currentValue, chart, temperatureUnit)}</strong>
      </div>

      <div className="chart-frame">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ left: 0, right: 4, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${chart.aliasKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="currentColor" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={42} domain={["auto", "auto"]} />
              <Tooltip
                formatter={(value: unknown) => [`${formatNumber(Number(value))} ${unit}`, chart.title]}
                labelFormatter={(_, payload: readonly { payload?: { sampledAt?: string } }[]) => {
                  const sampledAt = payload?.[0]?.payload?.sampledAt;
                  return sampledAt ? formatDate(sampledAt) : "Sample";
                }}
              />
              <Area type="monotone" dataKey="value" stroke="currentColor" fill={`url(#fill-${chart.aliasKey})`} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">Need more historical snapshots to draw a trend.</div>
        )}
      </div>
    </article>
  );
}

function ZoneMetricRow({
  zone,
  row,
  metrics,
  temperatureUnit,
}: {
  zone: ZoneName;
  row: MetricRow;
  metrics: Metric[];
  temperatureUnit: TemperatureUnit;
}) {
  if (metrics.length === 0) return null;

  const isNutrientLevelRow = zone === "Container" && row === "secondary";
  const isTroughLevelRow = (zone === "Nursery" || zone === "Cultivation") && row === "secondary";

  return (
    <section className={isTroughLevelRow ? "zone-row trough-level-row" : "zone-row"}>
      <h3>{rowTitle(zone, row)}</h3>
      {isNutrientLevelRow ? (
        <div className="metric metric-wide">
          <div className="metric-wide-header">
            <span>Nutrient and pH supply tanks</span>
            <small>Container inventory status</small>
          </div>
          <div className="nested-metric-grid">
            {metrics.map((metric) => (
              <div className="nested-metric" key={metric.id}>
                <span>{metric.label}</span>
                <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
                <small className="module-id">{metric.deviceId} · {metric.key}</small>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={isTroughLevelRow ? "metric-grid trough-level-grid" : "metric-grid"}>
          {metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />
          ))}
        </div>
      )}
    </section>
  );
}

function ZoneMonitoringSection({
  group,
  history,
  temperatureUnit,
}: {
  group: ZoneGroup;
  history: HistoryPoint[];
  temperatureUnit: TemperatureUnit;
}) {
  const latestUpdate = group.metrics
    .map((metric) => metric.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const zoneCharts = CHARTS.filter((chart) => chart.zone === group.zone);
  const nonChartMetrics = group.metrics.filter((metric) => !isChartedMetric(metric) && !isControlMetric(metric));
  const primary = nonChartMetrics.filter((metric) => getMetricRow(metric) === "primary").sort(sortMetrics);
  const secondary = nonChartMetrics.filter((metric) => getMetricRow(metric) === "secondary").sort(sortMetrics);
  const other = nonChartMetrics.filter((metric) => getMetricRow(metric) === "other").sort(sortMetrics);

  return (
    <article className="monitoring-zone-panel">
      <div className="zone-card-header">
        <div>
          <p className="zone-kicker">Monitoring</p>
          <h2>{group.zone}</h2>
        </div>
        <span className="metric-count">{group.metrics.length} values</span>
      </div>

      <p className="timestamp">Updated: {formatDate(latestUpdate)}</p>

      {zoneCharts.length > 0 ? (
        <section className={`zone-chart-grid zone-chart-grid-${group.zone.toLowerCase()}`}>
          {zoneCharts.map((chart) => (
            <ChartCard
              key={chart.aliasKey}
              chart={chart}
              history={history}
              currentValue={getLatestMetricValue([group], chart.aliasKey)}
              temperatureUnit={temperatureUnit}
            />
          ))}
        </section>
      ) : null}

      {nonChartMetrics.length > 0 ? (
        <div className="zone-row-stack">
          <ZoneMetricRow zone={group.zone} row="primary" metrics={primary} temperatureUnit={temperatureUnit} />
          <ZoneMetricRow zone={group.zone} row="secondary" metrics={secondary} temperatureUnit={temperatureUnit} />
          <ZoneMetricRow zone={group.zone} row="other" metrics={other} temperatureUnit={temperatureUnit} />
        </div>
      ) : null}

      {group.metrics.length === 0 ? (
        <div className="empty-zone">No connected mapped values found for this zone.</div>
      ) : null}
    </article>
  );
}

function ControlZoneSection({ group }: { group: ZoneGroup }) {
  const controlMetrics = group.metrics.filter(isControlMetric).sort(sortMetrics);
  const latestUpdate = controlMetrics
    .map((metric) => metric.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return (
    <article className="monitoring-zone-panel control-zone-panel">
      <div className="zone-card-header">
        <div>
          <p className="zone-kicker">Read-only control</p>
          <h2>{group.zone}</h2>
        </div>
        <span className="metric-count">{controlMetrics.length} controls</span>
      </div>

      <p className="timestamp">Updated: {formatDate(latestUpdate)}</p>

      {controlMetrics.length > 0 ? (
        <div className="metric-grid control-metric-grid">
          {controlMetrics.map((metric) => (
            <ToggleMetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      ) : (
        <div className="empty-zone">No connected mapped controls found for this zone.</div>
      )}
    </article>
  );
}

function ControlFoundation({ zoneGroups }: { zoneGroups: ZoneGroup[] }) {
  return (
    <section className="control-section">
      <article className="foundation-card control-note">
        <p className="zone-kicker">Control</p>
        <h2>Read-only control status</h2>
        <p>
          Outputs, pumps, lights, fans, valves, and similar command-adjacent values are grouped here by zone.
          These switches are status indicators only; command execution should be added only after authentication, audit logging,
          role permissions, lockouts, and safety interlocks are designed.
        </p>
      </article>

      <div className="monitoring-zone-stack">
        {zoneGroups.map((group) => (
          <ControlZoneSection key={group.zone} group={group} />
        ))}
      </div>
    </section>
  );
}

function RecipeFoundation({
  temperatureUnit,
  controllerId,
}: {
  temperatureUnit: TemperatureUnit;
  controllerId: string | null;
}) {
  return <RecipeDashboard temperatureUnit={temperatureUnit} controllerId={controllerId} />;
}

export default function Dashboard({
  initialRows,
  farmOptions: initialFarmOptions = [],
  selectedControllerId: initialSelectedControllerId = null,
}: DashboardProps) {
  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30");
  const [rows, setRows] = useState<ReportedStateRow[]>(initialRows);
  const [farmOptions] = useState<FarmOption[]>(initialFarmOptions);
  const [selectedControllerId, setSelectedControllerId] = useState<string | null>(
    initialSelectedControllerId ?? initialFarmOptions[0]?.controller_id ?? null,
  );
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyHours, setHistoryHours] = useState<HistoryHours>(readStoredHistoryHours);
  const [lastRefresh, setLastRefresh] = useState<string>(new Date().toISOString());
  const [latestScrapedAt, setLatestScrapedAt] = useState<string | null>(() => latestScrapedAtFromRows(initialRows));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(readStoredTemperatureUnit);
  const [activeSection, setActiveSection] = useState<AppSection>("monitoring");

const refresh = useCallback(async (showLoading = true, controllerId = selectedControllerId) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const latestParams = buildFarmQuery(controllerId);
      const historyParams = buildFarmQuery(controllerId);
      historyParams.set("hours", String(historyHours));

      const latestUrl = `/api/reported-state/latest?${latestParams.toString()}`;
      const historyUrl = `/api/reported-state/history?${historyParams.toString()}`;

      const [latestResponse, historyResponse] = await Promise.all([
        fetch(latestUrl, { cache: "no-store" }),
        fetch(historyUrl, { cache: "no-store" }),
      ]);
      const latestPayload = (await latestResponse.json()) as ApiResponse;
      const historyPayload = (await historyResponse.json()) as HistoryApiResponse;

      if (!latestResponse.ok || !latestPayload.ok || !latestPayload.data) {
        throw new Error(latestPayload.error ?? "Failed to load reported state data.");
      }

      setRows(latestPayload.data);
      setLatestScrapedAt(latestScrapedAtFromRows(latestPayload.data));
      setLastRefresh(latestPayload.generated_at ?? new Date().toISOString());
      setSelectedControllerId(latestPayload.selected_farm?.controllerId ?? controllerId ?? null);

      if (historyResponse.ok && historyPayload.ok && historyPayload.data) {
        setHistory(historyPayload.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [historyHours, selectedControllerId]);

  useEffect(() => {
    window.localStorage.setItem(TEMPERATURE_UNIT_STORAGE_KEY, temperatureUnit);
  }, [temperatureUnit]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_HOURS_STORAGE_KEY, String(historyHours));
  }, [historyHours]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh(false), refreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [refresh, refreshSeconds]);

  useEffect(() => {
    async function checkForNewData() {
      try {
        const params = buildFarmQuery(selectedControllerId);
        const response = await fetch(`/api/reported-state/latest-timestamp?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as LatestTimestampApiResponse;

        if (!response.ok || !payload.ok) return;
        if (!payload.latest_scraped_at) return;

        if (!latestScrapedAt) {
          setLatestScrapedAt(payload.latest_scraped_at);
          return;
        }

        if (payload.latest_scraped_at !== latestScrapedAt) {
          await refresh(false);
        }
      } catch {
        // Keep background refresh quiet. The normal refresh path reports visible errors.
      }
    }

    const interval = window.setInterval(checkForNewData, LIVE_CHECK_SECONDS * 1000);
    return () => window.clearInterval(interval);
  }, [latestScrapedAt, refresh, selectedControllerId]);

  const connectedRows = useMemo(() => {
    const explicitlyConnectedRows = rows.filter((row) => row.connected === true);
    return explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;
  }, [rows]);
  const zoneGroups = useMemo(() => buildZoneGroups(connectedRows), [connectedRows]);

  const selectedFarm = useMemo(() => {
    return farmOptions.find((farm) => farm.controller_id === selectedControllerId) ?? null;
  }, [farmOptions, selectedControllerId]);

  const farmName = selectedFarm?.farm_name ?? selectedFarm?.label ?? selectedControllerId ?? "Select a farm";

  function handleFarmChange(nextControllerId: string) {
    const nextValue = nextControllerId || null;

    setSelectedControllerId(nextValue);
    setRows([]);
    setHistory([]);
    setLatestScrapedAt(null);
    setError(null);

    const nextUrl = nextValue ? `/?farm=${encodeURIComponent(nextValue)}` : "/";
    window.history.replaceState(null, "", nextUrl);

    void refresh(true, nextValue);
  }

  const summary = useMemo(() => {
    const activeZones = zoneGroups.filter((group) => group.metrics.length > 0).length;
    const latestDeviceUpdate = connectedRows
      .map((row) => row.device_last_update_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    return { connectedDevices: connectedRows.length, activeZones, latestDeviceUpdate };
  }, [connectedRows, zoneGroups]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">OpenCEA Dashboard</p>
          <h1>{farmName}</h1>
          <p className="hero-copy">
            Open-source visibility for CEA container farms. Monitoring is live now; Control and Recipe foundations are staged for safe expansion.
          </p>
        </div>

        <div className="hero-actions">
          <label className="farm-selector">
            <span>Farm</span>
            <select value={selectedControllerId ?? ""} onChange={(event) => handleFarmChange(event.target.value)}>
              {farmOptions.length === 0 ? <option value="">No farms found</option> : null}
              {farmOptions.map((farm) => (
                <option value={farm.controller_id} key={farm.controller_id}>
                  {farm.label || farm.farm_name || farm.controller_id}
                </option>
              ))}
            </select>
          </label>

          <div className="toggle-group" aria-label="Dashboard section">
            <button
              className={activeSection === "monitoring" ? "toggle active" : "toggle"}
              onClick={() => setActiveSection("monitoring")}
              type="button"
            >
              Monitoring
            </button>
            <button
              className={activeSection === "control" ? "toggle active" : "toggle"}
              onClick={() => setActiveSection("control")}
              type="button"
            >
              Control
            </button>
            <button
              className={activeSection === "recipe" ? "toggle active" : "toggle"}
              onClick={() => setActiveSection("recipe")}
              type="button"
            >
              Recipe
            </button>
          </div>

          <div className="toggle-group" aria-label="Temperature unit">
            <button className={temperatureUnit === "C" ? "toggle active" : "toggle"} onClick={() => setTemperatureUnit("C")} type="button">
              °C
            </button>
            <button className={temperatureUnit === "F" ? "toggle active" : "toggle"} onClick={() => setTemperatureUnit("F")} type="button">
              °F
            </button>
          </div>

          <div className="toggle-group" aria-label="Chart timeline">
            {HISTORY_RANGES.map((range) => (
              <button
                key={range.hours}
                className={historyHours === range.hours ? "toggle active" : "toggle"}
                onClick={() => setHistoryHours(range.hours)}
                type="button"
              >
                {range.label}
              </button>
            ))}
          </div>

          <button onClick={() => refresh(true)} disabled={loading} type="button">
            {loading ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </section>

      <section className="summary-grid compact-summary">
        <div className="summary-card">
          <span>Connected modules</span>
          <strong>{summary.connectedDevices}</strong>
        </div>
        <div className="summary-card">
          <span>Active zones</span>
          <strong>{summary.activeZones}</strong>
        </div>
        <div className="summary-card wide-summary">
          <span>Latest module update</span>
          <strong>{formatDate(summary.latestDeviceUpdate)}</strong>
        </div>
      </section>

      <div className="subheader">
        <p>Last refreshed: {formatDate(lastRefresh)}</p>
        <p>Chart range: last {historyHours} hour{historyHours === 1 ? "" : "s"}</p>
        <p>Auto-refresh: every {refreshSeconds} seconds · New-data check: every {LIVE_CHECK_SECONDS} seconds</p>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {activeSection === "monitoring" ? (
        <section className="monitoring-zone-stack">
          {zoneGroups.map((group) => (
            <ZoneMonitoringSection
              key={group.zone}
              group={group}
              history={history}
              temperatureUnit={temperatureUnit}
            />
          ))}
        </section>
      ) : null}

      {activeSection === "control" ? <ControlFoundation zoneGroups={zoneGroups} /> : null}

      {activeSection === "recipe" ? (
        <RecipeFoundation temperatureUnit={temperatureUnit} controllerId={selectedControllerId} />
      ) : null}
    </main>
  );
}
