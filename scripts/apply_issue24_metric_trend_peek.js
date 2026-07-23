const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    console.log('Skipped ' + label);
    return source;
  }
  console.log('Patched ' + label);
  return source.replace(search, replacement);
}

const trendHelpers = `function getMetricTrendData(history: HistoryPoint[], metric: Metric, temperatureUnit: TemperatureUnit) {
  const alias = normalizeText(metric.aliasKey);
  const zone = normalizeText(metric.zone);
  const key = normalizeText(metric.key);

  return history
    .filter((point) => {
      if (normalizeText(point.alias_key) !== alias) return false;
      if (normalizeText(point.zone) !== zone) return false;
      const pointKey = normalizeText(point.io_key);
      return !pointKey || pointKey === key;
    })
    .slice(-48)
    .map((point) => ({
      sampledAt: point.sampled_at,
      label: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(point.sampled_at)),
      value: isTemperatureMetric(metric.key, metric.label, metric.aliasKey) && temperatureUnit === "F" ? celsiusToFahrenheit(point.value) : point.value,
    }));
}

function shouldShowMetricTrend(metric: Metric) {
  return (
    !isContainerNutrientLevelMetric(metric) &&
    !isTroughLevelMetric(metric) &&
    !isPumpMetric(metric) &&
    !isOutputMetric(metric) &&
    typeof metric.value === "number"
  );
}`;

if (!dashboard.includes('function getMetricTrendData(')) {
  dashboard = replaceOnce(
    dashboard,
    `function ToggleMetricCard({ metric }: { metric: Metric }) {`,
    trendHelpers + '\n\nfunction ToggleMetricCard({ metric }: { metric: Metric }) {',
    'metric trend data helpers'
  );
}

const oldTile = `function CompactMetricTile({ metric, temperatureUnit }: { metric: Metric; temperatureUnit: TemperatureUnit }) {
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

const newTile = `function CompactMetricTile({
  metric,
  history,
  temperatureUnit,
}: {
  metric: Metric;
  history: HistoryPoint[];
  temperatureUnit: TemperatureUnit;
}) {
  const [trendOpen, setTrendOpen] = useState(false);
  const token = compactMetricToken(metric);
  const status = compactMetricStatus(metric);
  const trendData = shouldShowMetricTrend(metric) ? getMetricTrendData(history, metric, temperatureUnit) : [];
  const hasTrend = trendData.length > 1;
  const trendUnit = isTemperatureMetric(metric.key, metric.label, metric.aliasKey) ? \`°\${temperatureUnit}\` : isTankDepthMetric(metric) || isSendPressureMetric(metric) || normalizeText(metric.aliasKey).includes("humidity") || normalizeText(metric.label).includes("humidity") ? "%" : "";

  return (
    <div className={\`compact-metric-tile \${compactMetricStateClass(metric)} \${token ? "has-icon" : "no-icon"} \${hasTrend ? "has-trend" : "no-trend"} \${trendOpen ? "trend-open" : ""}\`}>
      <button
        type="button"
        className="compact-metric-main"
        onClick={() => hasTrend ? setTrendOpen((current) => !current) : undefined}
        aria-expanded={hasTrend ? trendOpen : undefined}
        aria-label={hasTrend ? \`Toggle recent trend for \${displayMetricLabel(metric)}\` : displayMetricLabel(metric)}
      >
        {token ? <span className="compact-metric-token">{token}</span> : null}
        <div className="compact-metric-copy">
          <span>{displayMetricLabel(metric)}</span>
          <strong className={valueClass(metric)}>{formatValue(metric.value, metric, temperatureUnit)}</strong>
          {status ? <em className={\`metric-status-pill \${status.className}\`}>{status.label}</em> : null}
          {hasTrend ? <small className="metric-trend-cue">Trend</small> : null}
        </div>
      </button>

      {hasTrend ? (
        <div className="metric-trend-peek" aria-label={\`Recent trend for \${displayMetricLabel(metric)}\`}>
          <div className="metric-trend-header">
            <span>Recent trend</span>
            <strong>{formatValue(metric.value, metric, temperatureUnit)}</strong>
          </div>
          <div className="metric-trend-chart">
            <ResponsiveContainer width="100%" height={74}>
              <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id={\`compact-fill-\${metric.id.replace(/[^a-zA-Z0-9_-]/g, "-")}\`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Tooltip
                  formatter={(value: unknown) => [\`\${formatNumber(Number(value))}\${trendUnit ? " " + trendUnit : ""}\`, displayMetricLabel(metric)]}
                  labelFormatter={(_, payload: readonly { payload?: { sampledAt?: string } }[]) => {
                    const sampledAt = payload?.[0]?.payload?.sampledAt;
                    return sampledAt ? formatDate(sampledAt) : "Sample";
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="currentColor"
                  fill={\`url(#compact-fill-\${metric.id.replace(/[^a-zA-Z0-9_-]/g, "-")})\`}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}`;

dashboard = replaceOnce(dashboard, oldTile, newTile, 'compact metric trend tile');

dashboard = replaceOnce(
  dashboard,
  `function CompactMetricSection({ title, metrics, temperatureUnit }: { title: string; metrics: Metric[]; temperatureUnit: TemperatureUnit }) {`,
  `function CompactMetricSection({ title, metrics, history, temperatureUnit }: { title: string; metrics: Metric[]; history: HistoryPoint[]; temperatureUnit: TemperatureUnit }) {`,
  'compact metric section signature'
);

dashboard = replaceOnce(
  dashboard,
  `<CompactMetricTile key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricTile key={metric.id} metric={metric} history={history} temperatureUnit={temperatureUnit} />`,
  'compact metric tile history prop'
);

dashboard = replaceOnce(
  dashboard,
  `history: _history,`,
  `history,`,
  'zone monitoring history argument'
);

const sectionCalls = [
  `<CompactMetricSection title="Farm-wide climate" metrics={containerClimate} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Nutrient and pH supply tanks" metrics={containerSupply} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Water chemistry" metrics={nurseryChemistry} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Tank and trough levels" metrics={nurseryLevels} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Water chemistry" metrics={cultivationChemistry} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Tank depth and send pressure" metrics={cultivationHydraulics} temperatureUnit={temperatureUnit} />`,
  `<CompactMetricSection title="Other monitoring values" metrics={otherMetrics} temperatureUnit={temperatureUnit} />`
];

for (const call of sectionCalls) {
  dashboard = replaceOnce(
    dashboard,
    call,
    call.replace(' temperatureUnit={temperatureUnit}', ' history={history} temperatureUnit={temperatureUnit}'),
    'compact metric section history prop'
  );
}

dashboard = dashboard.replaceAll(
  `<MetricCard key={metric.id} metric={metric} history={history} temperatureUnit={temperatureUnit} />`,
  `<MetricCard key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />`
);

dashboard = dashboard.replaceAll(
  `history={history} history={history}`,
  `history={history}`
);

const marker = 'Issue 24 metric trend peek';
const css = `

/* ${marker} */
.compact-metric-tile {
  position: relative;
  overflow: visible;
  display: block !important;
}

.compact-metric-main {
  width: 100%;
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: 0.55rem;
  align-items: center;
  border: 0 !important;
  background: transparent !important;
  color: inherit !important;
  padding: 0 !important;
  border-radius: 0 !important;
  text-align: left;
  box-shadow: none !important;
}

.compact-metric-tile.no-icon .compact-metric-main {
  grid-template-columns: 1fr;
}

.metric-trend-cue {
  color: rgba(186, 230, 253, 0.72);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.metric-trend-peek {
  display: none;
  margin-top: 0.55rem;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  padding-top: 0.45rem;
  color: #7dd3fc;
}

.compact-metric-tile.has-trend:hover .metric-trend-peek,
.compact-metric-tile.has-trend:focus-within .metric-trend-peek,
.compact-metric-tile.trend-open .metric-trend-peek {
  display: block;
}

.metric-trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: rgba(226, 232, 240, 0.74);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.metric-trend-header strong {
  color: #f8fafc;
  font-size: 0.72rem;
}

.metric-trend-chart {
  height: 74px;
  margin-top: 0.25rem;
}

.metric-trend-chart .recharts-tooltip-wrapper {
  z-index: 30;
}

@media (hover: hover) and (min-width: 900px) {
  .compact-metric-tile.has-trend:hover {
    z-index: 5;
  }
}

@media (max-width: 760px) {
  .metric-trend-cue {
    grid-column: 1 / -1;
  }
}
`;

if (!globals.includes(marker)) {
  globals += css;
  console.log('Patched metric trend peek CSS.');
} else {
  console.log('Skipped metric trend peek CSS.');
}

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(globalsPath, globals);
