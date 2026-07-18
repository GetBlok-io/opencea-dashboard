const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

const heroCopy = `          <p className="hero-copy">
            Open-source visibility for CEA container farms. Monitoring is live now; Control and Recipe foundations are staged for safe expansion.
          </p>`;
const heroCopyWithStats = `${heroCopy}

          <div className="farm-inline-stats" aria-label="Farm status summary">
            <span className="farm-inline-stat">
              <small>Modules</small>
              <strong>{summary.connectedDevices}</strong>
            </span>
            <span className="farm-inline-stat">
              <small>Zones</small>
              <strong>{summary.activeZones}</strong>
            </span>
            <span className="farm-inline-stat farm-inline-stat-wide">
              <small>Latest update</small>
              <strong>{formatShortDate(summary.latestDeviceUpdate)}</strong>
            </span>
          </div>`;

if (!dashboard.includes('farm-inline-stats') && dashboard.includes(heroCopy)) {
  dashboard = dashboard.replace(heroCopy, heroCopyWithStats);
  console.log('Patched farm inline stats under farm name.');
} else {
  console.log('Skipped farm inline stats.');
}

dashboard = dashboard.replace(
  /\n      <section className="summary-grid compact-summary">[\s\S]*?\n      <\/section>\n\n      <div className="subheader">/,
  '\n      <div className="subheader">'
);

const iconFunction = `function compactMetricToken(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  if (alias.includes("air_temperature") || label.includes("air temperature")) return "🌡️";
  if (alias.includes("humidity") || label.includes("humidity")) return "💧";
  if (alias.includes("co2") || label.includes("co2")) return "CO₂";
  if (alias.includes("ph") || label.includes("ph")) return "pH";
  if (alias.includes("ec") || label.includes("ec")) return "⚡";
  if (alias.includes("water_temperature") || label.includes("water temperature")) return "🌊";
  if (isTankDepthMetric(metric)) return "🛢️