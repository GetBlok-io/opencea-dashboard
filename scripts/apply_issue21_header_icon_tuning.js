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
  if (alias.includes("air_temperature") || label.includes("air temperature")) return "\uD83C\uDF21\uFE0F";
  if (alias.includes("humidity") || label.includes("humidity")) return "\uD83D\uDCA7";
  if (alias.includes("co2") || label.includes("co2")) return "CO\u2082";
  if (alias.includes("ph") || label.includes("ph")) return "pH";
  if (alias.includes("ec") || label.includes("ec")) return "\u26A1";
  if (alias.includes("water_temperature") || label.includes("water temperature")) return "\uD83C\uDF0A";
  if (isTankDepthMetric(metric)) return "\uD83D\uDEE2\uFE0F";
  if (isTroughLevelMetric(metric)) return "LVL";
  if (isSendPressureMetric(metric)) return "PSI";
  if (isContainerNutrientLevelMetric(metric)) return "\uD83E\uDDEA";
  return "IO";
}`;

dashboard = dashboard.replace(
  /function compactMetricToken\(metric: Metric\) \{[\s\S]*?\n\}/,
  iconFunction
);

const marker = 'Issue 21 compact monitoring header and icon tuning';
const cssPatch = `

/* ${marker} */
.farm-inline-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.farm-inline-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  border: 1px solid #dbe4ee;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  padding: 0.32rem 0.65rem;
}

.farm-inline-stat small {
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.farm-inline-stat strong {
  color: #0f172a;
  font-size: 0.83rem;
  font-weight: 800;
}

.farm-inline-stat-wide strong {
  font-size: 0.78rem;
}

.compact-summary {
  display: none !important;
}

.compact-metric-tile {
  padding: 0.5rem 0.62rem;
  border-radius: 0.75rem;
}

.compact-metric-token {
  min-height: 1.9rem;
  width: 2.45rem;
  min-width: 2.45rem;
  padding: 0 0.35rem;
  font-size: 1rem;
}

.compact-metric-copy span {
  font-size: 0.8rem;
}

.compact-metric-copy strong {
  font-size: 0.95rem;
}
`;

if (!globals.includes(marker)) {
  globals += cssPatch;
  console.log('Patched compact monitoring header and icon CSS.');
} else {
  console.log('Skipped compact monitoring header and icon CSS.');
}

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(globalsPath, globals);
