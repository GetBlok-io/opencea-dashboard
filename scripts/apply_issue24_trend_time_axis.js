const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

const axisLine = '<XAxis dataKey="label" minTickGap={18} tickLine={false} axisLine={false} height={18} />';

// Keep this idempotent and targeted to the compact trend chart only.
if (!dashboard.includes('className="metric-trend-chart"')) {
  console.log('Skipped trend time axis: compact trend chart not found.');
} else if (dashboard.includes(axisLine)) {
  console.log('Skipped trend time axis: already patched.');
} else {
  const marker = '                <Tooltip\n';
  if (!dashboard.includes(marker)) {
    console.log('Skipped trend time axis: tooltip target not found.');
  } else {
    dashboard = dashboard.replace(marker, '                ' + axisLine + '\n' + marker);
    console.log('Patched trend time axis.');
  }
}

fs.writeFileSync(dashboardPath, dashboard);
