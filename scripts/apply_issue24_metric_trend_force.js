const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

const helpers = `function getMetricTrendData(history: HistoryPoint[], metric: Metric, temperatureUnit: TemperatureUnit) {
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
  dashboard = dashboard.replace('function ToggleMetricCard({ metric }: { metric: Metric }) {', helpers + '\n\nfunction ToggleMetricCard({ metric }: { metric: Metric }) {');
}

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
                <Tooltip formatter={(value: unknown) => [\`\${formatNumber(Number(value))}\${trendUnit ? " " + trendUnit : ""}\`, displayMetricLabel(metric)]} />
                <Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}`;

const start = dashboard.indexOf('function CompactMetricTile(');
const end = dashboard.indexOf('function CompactMetricSection', start);
if (start >= 0 && end > start) {
  dashboard = dashboard.slice(0, start) + newTile + '\n\n' + dashboard.slice(end);
  console.log('Force patched CompactMetricTile.');
} else {
  console.log('Skipped CompactMetricTile force patch.');
}

dashboard = dashboard.replace(
  'function CompactMetricSection({ title, metrics, temperatureUnit }: { title: string; metrics: Metric[]; temperatureUnit: TemperatureUnit })',
  'function CompactMetricSection({ title, metrics, history, temperatureUnit }: { title: string; metrics: Metric[]; history: HistoryPoint[]; temperatureUnit: TemperatureUnit })'
);

dashboard = dashboard.replace(
  '<CompactMetricTile key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />',
  '<CompactMetricTile key={metric.id} metric={metric} history={history} temperatureUnit={temperatureUnit} />'
);

dashboard = dashboard.replace('history: _history,', 'history,');

const sectionCalls = [
  'metrics={containerClimate}',
  'metrics={containerSupply}',
  'metrics={nurseryChemistry}',
  'metrics={nurseryLevels}',
  'metrics={cultivationChemistry}',
  'metrics={cultivationHydraulics}',
  'metrics={otherMetrics}'
];
for (const marker of sectionCalls) {
  dashboard = dashboard.replace(
    marker + ' temperatureUnit={temperatureUnit}',
    marker + ' history={history} temperatureUnit={temperatureUnit}'
  );
}

dashboard = dashboard.replaceAll('history={history} history={history}', 'history={history}');
dashboard = dashboard.replaceAll('<MetricCard key={metric.id} metric={metric} history={history} temperatureUnit={temperatureUnit} />', '<MetricCard key={metric.id} metric={metric} temperatureUnit={temperatureUnit} />');

fs.writeFileSync(dashboardPath, dashboard);
