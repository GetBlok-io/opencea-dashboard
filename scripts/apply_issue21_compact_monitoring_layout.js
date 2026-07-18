const fs = require('fs');
const path = require('path');
const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

function patchLiteral(source, before, after, label) {
  if (!source.includes(before)) {
    console.log('Skipped ' + label);
    return source;
  }
  console.log('Patched ' + label);
  return source.replace(before, after);
}

function patchRegex(source, pattern, after, label) {
  if (!pattern.test(source)) {
    console.log('Skipped ' + label);
    return source;
  }
  console.log('Patched ' + label);
  return source.replace(pattern, after);
}

dashboard = patchLiteral(
  dashboard,
  '  "nutrient_b_level",\n  "ph_up_level",',
  '  "nutrient_b_level",\n  "nutrient_c_level",\n  "boost_level",\n  "ph_up_level",',
  'nutrient C and boost aliases',
);

const compactHelpers = `
function compactMetricToken(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  if (alias.includes("air_temperature") || label.includes("air temperature")) return "TEMP";
  if (alias.includes("humidity") || label.includes("humidity")) return "RH";
  if (alias.includes("co2") || label.includes("co2")) return "CO2";
  if (alias.includes("ph") || label.includes("ph")) return "pH";
  if (alias.includes("ec") || label.includes("ec")) return "EC";
  if (alias.includes("water_temperature") || label.includes("water temperature")) return "H2O";
  if (isTankDepthMetric(metric)) return "TANK";
  if (isTroughLevelMetric(metric)) return "LVL";
  if (isSendPressureMetric(metric)) return "PSI";
  if (isContainerNutrientLevelMetric(metric)) return "SUP";
  return "IO";
}

function compactMetricStateClass(metric: Metric) {
  const valueClassName = valueClass(metric);
  if (valueClassName === "alert-value") return "compact-metric-warning";
  if (valueClassName === "active-value") return "compact-metric-active";
  return "compact-metric-normal";
}

function compactSupplySortPriority(metric: Metric) {
  const alias = normalizeText(metric.aliasKey);
  const label = normalizeText(metric.label);
  if (alias.includes("nutrient_a") || label.includes("nutrient a")) return 0;
  if (alias.includes("nutrient_b") || label.includes("nutrient b")) return 1;
  if (alias.includes("nutrient_c") || label.includes("nutrient c")) return 2;
  if (alias.includes("ph_down") || label.includes("ph down")) return 3;
  if (alias.includes("ph_up") || label.includes("ph up")) return 4;
  if (alias.includes("boost") || label.includes("boost")) return 5;
  return 10;
}

function sortCompactMetrics(a: Metric, b: Metric) {
  if (isContainerNutrientLevelMetric(a) || isContainerNutrientLevelMetric(b)) {
    const supplyDelta = compactSupplySortPriority(a) - compactSupplySortPriority(b);
    if (supplyDelta !== 0) return supplyDelta;
  }
  return sortMetrics(a, b);
}

function aliasIn(metric: Metric, aliases: string[]) {
  const alias = normalizeText(metric.aliasKey);
  return aliases.includes(alias);
}

function CompactMetricTile({ metric, temperatureUnit }: { metric: Metric; temperatureUnit: TemperatureUnit }) {
  return (
    <div className={\`compact-metric-tile \${compactMetricStateClass(metric)}\`}>
      <span className="compact-metric-token">{compactMetricToken(metric)}</span>
      <div className="compact-metric-copy">
        <span>{metric.label}</span>
        <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
      </div>
    </div>
  );
}

function CompactMetricSection({ title, metrics, temperatureUnit }: { title: string; metrics: Metric[]; temperatureUnit: TemperatureUnit }) {
  if (metrics.length === 0) return null;
  return (
    <section className="compact-metric-section">
      <h3>{title}</h3>
      <div className="compact-metric-list">
        {metrics.map((metric) => (
          <CompactMetricTile key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />
        ))}
      </div>
    </section>
  );
}
`;

if (!dashboard.includes('function compactMetricToken(metric: Metric)')) {
  dashboard = dashboard.replace('function ZoneMonitoringSection({', compactHelpers + '\nfunction ZoneMonitoringSection({');
  console.log('Patched compact monitoring helpers.');
}

const newZoneMonitoring = `function ZoneMonitoringSection({
  group,
  history: _history,
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

  const monitoringMetrics = group.metrics
    .filter((metric) => !isControlMetric(metric))
    .sort(sortCompactMetrics);

  const containerClimate = monitoringMetrics.filter((metric) => aliasIn(metric, ["air_temperature", "relative_humidity", "co2"]));
  const containerSupply = monitoringMetrics.filter(isContainerNutrientLevelMetric);
  const nurseryChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["nursery_ph", "nursery_ec", "nursery_water_temperature"]));
  const nurseryLevels = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isTroughLevelMetric(metric));
  const cultivationChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["cultivation_ph", "cultivation_ec", "cultivation_water_temperature"]));
  const cultivationHydraulics = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isSendPressureMetric(metric));

  const alreadyDisplayed = new Set([
    ...containerClimate,
    ...containerSupply,
    ...nurseryChemistry,
    ...nurseryLevels,
    ...cultivationChemistry,
    ...cultivationHydraulics,
  ].map((metric) => metric.id));

  const otherMetrics = monitoringMetrics.filter((metric) => !alreadyDisplayed.has(metric.id));

  return (
    <article className={\`monitoring-zone-panel compact-zone-panel compact-zone-\${group.zone.toLowerCase()}\`}>
      <div className="zone-card-header compact-zone-header">
        <div>
          <p className="zone-kicker">Monitoring</p>
          <h2>{group.zone === "Container" ? "Container-Wide" : group.zone}</h2>
        </div>
        <span className="metric-count">{monitoringMetrics.length} values</span>
      </div>

      <p className="timestamp">Updated: {formatDate(latestUpdate)}</p>

      <div className="compact-monitoring-stack">
        {group.zone === "Container" ? (
          <>
            <CompactMetricSection title="Farm-wide climate" metrics={containerClimate} temperatureUnit={temperatureUnit} />
            <CompactMetricSection title="Nutrient and pH supply tanks" metrics={containerSupply} temperatureUnit={temperatureUnit} />
          </>
        ) : null}

        {group.zone === "Nursery" ? (
          <>
            <CompactMetricSection title="Water chemistry" metrics={nurseryChemistry} temperatureUnit={temperatureUnit} />
            <CompactMetricSection title="Tank and trough levels" metrics={nurseryLevels} temperatureUnit={temperatureUnit} />
          </>
        ) : null}

        {group.zone === "Cultivation" ? (
          <>
            <CompactMetricSection title="Water chemistry" metrics={cultivationChemistry} temperatureUnit={temperatureUnit} />
            <CompactMetricSection title="Tank depth and send pressure" metrics={cultivationHydraulics} temperatureUnit={temperatureUnit} />
          </>
        ) : null}

        <CompactMetricSection title="Other monitoring values" metrics={otherMetrics} temperatureUnit={temperatureUnit} />
      </div>

      {monitoringMetrics.length === 0 ? (
        <div className="empty-zone">No connected mapped values found for this zone.</div>
      ) : null}
    </article>
  );
}

`;

dashboard = patchRegex(
  dashboard,
  /function ZoneMonitoringSection\(\{[\s\S]*?\nfunction ControlZoneSection\(/,
  newZoneMonitoring + 'function ControlZoneSection(',
  'compact ZoneMonitoringSection',
);

const cssPatch = `

/* Issue 21 compact monitoring layout */
.monitoring-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.compact-zone-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100%;
}

.compact-zone-header {
  align-items: flex-start;
}

.compact-monitoring-stack {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-top: 0.75rem;
}

.compact-metric-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.compact-metric-section h3 {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.compact-metric-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

.compact-metric-tile {
  display: grid;
  grid-template-columns: 3.35rem minmax(0, 1fr);
  gap: 0.65rem;
  align-items: center;
  border: 1px solid #dbe4ee;
  border-radius: 0.9rem;
  padding: 0.65rem 0.75rem;
  background: #f8fafc;
}

.compact-metric-token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.compact-metric-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.compact-metric-copy span {
  min-width: 0;
  color: #475569;
  font-size: 0.86rem;
  line-height: 1.2;
}

.compact-metric-copy strong {
  color: #0f172a;
  font-size: 1rem;
  white-space: nowrap;
}

.compact-metric-warning {
  border-color: #f59e0b;
  background: #fffbeb;
}

.compact-metric-warning .compact-metric-token {
  background: #fef3c7;
  color: #92400e;
}

.compact-metric-active .compact-metric-token {
  background: #dcfce7;
  color: #166534;
}

@media (max-width: 1180px) {
  .monitoring-grid {
    grid-template-columns: 1fr;
  }

  .compact-metric-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .compact-metric-list {
    grid-template-columns: 1fr;
  }

  .compact-metric-tile {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .compact-metric-copy {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }
}
`;

if (!globals.includes('Issue 21 compact monitoring layout')) {
  globals += cssPatch;
  console.log('Patched compact monitoring CSS.');
} else {
  console.log('Skipped compact monitoring CSS.');
}

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(globalsPath, globals);
