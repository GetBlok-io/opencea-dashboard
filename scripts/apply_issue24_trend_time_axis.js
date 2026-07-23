const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

const oldChart = `<AreaChart data={trendData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                <defs>`;
const newChart = `<AreaChart data={trendData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                <defs>`;

// Keep this idempotent and targeted to the compact trend chart only.
if (!dashboard.includes('className="metric-trend-chart"')) {
  console.log('Skipped trend time axis: compact trend chart not found.');
} else if (dashboard.includes('<XAxis dataKey="label" minTickGap={18} tickLine={false} axisLine={false} height={18} />')) {
  console.log('Skipped trend time axis: already patched.');
} else {
  const target = `<Tooltip
                  formatter={(value: unknown) => [\`${formatNumber(Number(value))}\${trendUnit ? " " + trendUnit : ""}\`, displayMetricLabel(metric)]}
                  labelFormatter={(_, payload: readonly { payload?: { sampledAt?: string } }[]) => {
                    const sampledAt = payload?.[0]?.payload?.sampledAt;
                    return sampledAt ? formatDate(sampledAt) : "Sample";
                  }}
                />`;

  const replacement = `<XAxis dataKey="label" minTickGap={18} tickLine={false} axisLine={false} height={18} />
                <Tooltip
                  formatter={(value: unknown) => [\`${formatNumber(Number(value))}\${trendUnit ? " " + trendUnit : ""}\`, displayMetricLabel(metric)]}
                  labelFormatter={(_, payload: readonly { payload?: { sampledAt?: string } }[]) => {
                    const sampledAt = payload?.[0]?.payload?.sampledAt;
                    return sampledAt ? formatDate(sampledAt) : "Sample";
                  }}
                />`;

  if (!dashboard.includes(target)) {
    console.log('Skipped trend time axis: tooltip target not found.');
  } else {
    dashboard = dashboard.replace(target, replacement);
    console.log('Patched trend time axis.');
  }
}

fs.writeFileSync(dashboardPath, dashboard);
