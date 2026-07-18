const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

function patchRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.log('Skipped ' + label);
    return source;
  }
  console.log('Patched ' + label);
  return source.replace(pattern, replacement);
}

const valueHelpers = `function formatOneDecimal(value: number) {
  return value.toFixed(1);
}

function displayMetricLabel(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = metric.label || metric.key;

  if (alias === "nutrient_a_level") return "Nutrient A";
  if (alias === "nutrient_b_level") return "Nutrient B";
  if (alias === "nutrient_c_level" || alias === "boost_level") return "Nutrient C";
  if (alias === "ph_up_level") return "pH Up";
  if (alias === "ph_down_level") return "pH Down";

  return label;
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
      return `${formatOneDecimal(value)}%`;
    }

    if (isTemperatureMetric(metric.key, metric.label, metric.aliasKey)) {
      const converted = temperatureUnit === "F" ? celsiusToFahrenheit(value) : value;
      return `${formatOneDecimal(converted)} °${temperatureUnit}`;
    }

    const alias = normalizeText(metric.aliasKey);
    const label = normalizeText(metric.label);
    if (alias.includes("humidity") || label.includes("humidity")) {
      return `${formatOneDecimal(value)}%`;
    }

    return formatOneDecimal(value);
  }

  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "—";
  return String(value);
}`;

dashboard = patchRegex(
  dashboard,
  /function formatPercent\(value: number\) \{[\s\S]*?function valueClass\(metric: Metric\) \{/,
  valueHelpers + '\n\nfunction valueClass(metric: Metric) {',
  'one-decimal value formatting and display labels'
);

const tokenAndStatus = `function compactMetricToken(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  if (alias.includes("temperature") || label.includes("temperature")) return "🌡️";
  if (alias.includes("humidity") || label.includes("humidity")) return "💧";
  if (alias.includes("co2") || label.includes("co2")) return "CO₂";
  if (alias.includes("ph") || label.includes("ph")) return "pH";
  if (alias.includes("ec") || label.includes("ec")) return "⚡";
  if (isContainerNutrientLevelMetric(metric)) return "🧪";
  return "";
}

function compactMetricStatus(metric: Metric) {
  if (typeof metric.value !== "number") return null;

  if (isTankDepthMetric(metric)) {
    if (metric.value >= 95) return { label: "FULL", className: "metric-status-ok" };
    if (metric.value >= 50) return { label: "OK", className: "metric-status-ok" };
    if (metric.value >= 20) return { label: "LOW", className: "metric-status-warning" };
    return { label: "EMPTY", className: "metric-status-alert" };
  }

  if (isTroughLevelMetric(metric)) {
    return metric.value === 1
      ? { label: "EMPTY", className: "metric-status-ok" }
      : { label: "FULL", className: "metric-status-alert" };
  }

  if (isContainerNutrientLevelMetric(metric)) {
    return metric.value === 1
      ? { label: "LOW", className: "metric-status-alert" }
      : { label: "OK", className: "metric-status-ok" };
  }

  return null;
}

function compactMetricStateClass(metric: Metric) {
  const status = compactMetricStatus(metric);
  if (status?.className === "metric-status-alert") return "compact-metric-alert";
  if (status?.className === "metric-status-warning") return "compact-metric-warning";
  const valueClassName = valueClass(metric);
  if (valueClassName === "alert-value") return "compact-metric-alert";
  if (valueClassName === "active-value") return "compact-metric-active";
  return "compact-metric-normal";
}`;

dashboard = patchRegex(
  dashboard,
  /function compactMetricToken\(metric: Metric\) \{[\s\S]*?function compactSupplySortPriority\(/,
  tokenAndStatus + '\n\nfunction compactSupplySortPriority(',
  'trough status colors and metric tokens'
);

const tileFunction = `function CompactMetricTile({ metric, temperatureUnit }: { metric: Metric; temperatureUnit: TemperatureUnit }) {
  const token = compactMetricToken(metric);
  const status = compactMetricStatus(metric);

  return (
    <div className={`compact-metric-tile ${compactMetricStateClass(metric)} ${token ? "has-icon" : "no-icon"}`}>
      {token ? <span className="compact-metric-token">{token}</span> : null}
      <div className="compact-metric-copy">
        <span>{displayMetricLabel(metric)}</span>
        <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
        {status ? <em className={`metric-status-pill ${status.className}`}>{status.label}</em> : null}
      </div>
    </div>
  );
}`;

dashboard = patchRegex(
  dashboard,
  /function CompactMetricTile\(\{ metric, temperatureUnit \}: \{ metric: Metric; temperatureUnit: TemperatureUnit \}\) \{[\s\S]*?\n\}/,
  tileFunction,
  'display labels in compact metric tile'
);

dashboard = dashboard.replace(
  'const nurseryChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["nursery_ph", "nursery_ec", "nursery_water_temperature"]));\n  const nurseryLevels = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isTroughLevelMetric(metric));',
  'const nurseryChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["nursery_ph", "nursery_ec", "nursery_tank_depth", "nursery_water_temperature"]));\n  const nurseryLevels = monitoringMetrics.filter((metric) => isTroughLevelMetric(metric));'
);

dashboard = dashboard.replace(
  'const cultivationChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["cultivation_ph", "cultivation_ec", "cultivation_water_temperature"]));\n  const cultivationHydraulics = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isSendPressureMetric(metric));',
  'const cultivationChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["cultivation_ph", "cultivation_ec", "cultivation_water_temperature"]));\n  const cultivationHydraulics = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isSendPressureMetric(metric));'
);

fs.writeFileSync(dashboardPath, dashboard);
