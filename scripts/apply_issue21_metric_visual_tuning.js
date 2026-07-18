const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

function patchRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.log('Skipped ' + label);
    return source;
  }
  console.log('Patched ' + label);
  return source.replace(pattern, replacement);
}

const tokenFunction = `function compactMetricToken(metric: Metric) {
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
      ? { label: "EMPTY", className: "metric-status-alert" }
      : { label: "FULL", className: "metric-status-ok" };
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
  tokenFunction + '\n\nfunction compactSupplySortPriority(',
  'metric token and status helpers'
);

const tileFunction = `function CompactMetricTile({ metric, temperatureUnit }: { metric: Metric; temperatureUnit: TemperatureUnit }) {
  const token = compactMetricToken(metric);
  const status = compactMetricStatus(metric);

  return (
    <div className={\`compact-metric-tile \${compactMetricStateClass(metric)} \${token ? "has-icon" : "no-icon"}\`}>
      {token ? <span className="compact-metric-token">{token}</span> : null}
      <div className="compact-metric-copy">
        <span>{metric.label}</span>
        <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
        {status ? <em className={\`metric-status-pill \${status.className}\`}>{status.label}</em> : null}
      </div>
    </div>
  );
}`;

dashboard = patchRegex(
  dashboard,
  /function CompactMetricTile\(\{ metric, temperatureUnit \}: \{ metric: Metric; temperatureUnit: TemperatureUnit \}\) \{[\s\S]*?\n\}/,
  tileFunction,
  'compact metric tile'
);

const marker = 'Issue 21 metric visual tuning';
const css = `

/* ${marker} */
.compact-metric-tile {
  grid-template-columns: 2.5rem minmax(0, 1fr);
  border-color: rgba(148, 163, 184, 0.22) !important;
  background: rgba(15, 23, 42, 0.24) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(8px);
}

.compact-metric-tile.no-icon {
  grid-template-columns: 1fr;
}

.compact-metric-token {
  min-height: 1.8rem;
  width: 1.8rem;
  min-width: 1.8rem;
  justify-self: center;
  background: rgba(14, 165, 233, 0.12) !important;
  color: #bae6fd !important;
  border: 1px solid rgba(125, 211, 252, 0.22);
  font-size: 0.82rem;
}

.compact-metric-copy {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center !important;
  gap: 0.55rem !important;
}

.compact-metric-copy span {
  color: rgba(226, 232, 240, 0.82) !important;
}

.compact-metric-copy strong {
  color: #f8fafc !important;
  font-weight: 800;
}

.metric-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.12rem 0.42rem;
  min-width: 3rem;
  font-size: 0.64rem;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.metric-status-ok {
  color: #bbf7d0;
  background: rgba(22, 163, 74, 0.24);
  border: 1px solid rgba(134, 239, 172, 0.22);
}

.metric-status-warning {
  color: #fde68a;
  background: rgba(217, 119, 6, 0.24);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.metric-status-alert {
  color: #fecaca;
  background: rgba(220, 38, 38, 0.25);
  border: 1px solid rgba(248, 113, 113, 0.28);
}

.compact-metric-alert {
  border-color: rgba(248, 113, 113, 0.45) !important;
  background: rgba(127, 29, 29, 0.24) !important;
}

.compact-metric-warning {
  border-color: rgba(251, 191, 36, 0.42) !important;
  background: rgba(120, 53, 15, 0.22) !important;
}

.compact-metric-normal {
  border-color: rgba(148, 163, 184, 0.22) !important;
}

@media (max-width: 760px) {
  .compact-metric-copy {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .metric-status-pill {
    grid-column: 2;
  }
}
`;

if (!globals.includes(marker)) {
  globals += css;
  console.log('Patched metric visual tuning CSS.');
} else {
  console.log('Skipped metric visual tuning CSS.');
}

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(globalsPath, globals);
