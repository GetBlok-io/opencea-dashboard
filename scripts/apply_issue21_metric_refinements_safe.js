const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

function replaceExact(oldText, newText, label) {
  if (!dashboard.includes(oldText)) {
    console.log('Skipped ' + label);
    return;
  }
  dashboard = dashboard.replace(oldText, newText);
  console.log('Patched ' + label);
}

replaceExact(
  'function formatPercent(value: number) {\n  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\\.0$/, "");\n  return `${rounded}%`;\n}',
  'function formatPercent(value: number) {\n  return value.toFixed(1) + "%";\n}',
  'percent formatter'
);

replaceExact(
  'function formatNumber(value: number) {\n  if (Math.abs(value) >= 100) return value.toFixed(0);\n  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\\.0$/, "");\n  return value.toFixed(2).replace(/\\.00$/, "");\n}',
  'function formatNumber(value: number) {\n  return value.toFixed(1);\n}',
  'number formatter'
);

replaceExact(
  '    return Number.isInteger(value) ? value.toString() : value.toFixed(2);',
  '    const alias = normalizeText(metric.aliasKey);\n    const label = normalizeText(metric.label);\n    if (alias.includes("humidity") || label.includes("humidity")) return formatPercent(value);\n    return formatNumber(value);',
  'generic metric formatter'
);

replaceExact(
  'if (isTroughLevelMetric(metric) && metric.value === 1) return "alert-value";',
  'if (isTroughLevelMetric(metric) && metric.value !== 1) return "alert-value";',
  'trough alert value class'
);

if (!dashboard.includes('function displayMetricLabel(metric: Metric)')) {
  dashboard = dashboard.replace(
    'function compactMetricToken(metric: Metric) {',
    'function displayMetricLabel(metric: Metric) {\n  const alias = normalizeText(metric.aliasKey);\n  if (alias === "nutrient_a_level") return "Nutrient A";\n  if (alias === "nutrient_b_level") return "Nutrient B";\n  if (alias === "nutrient_c_level" || alias === "boost_level") return "Nutrient C";\n  if (alias === "ph_up_level") return "pH Up";\n  if (alias === "ph_down_level") return "pH Down";\n  return metric.label || metric.key;\n}\n\nfunction compactMetricToken(metric: Metric) {'
  );
  console.log('Patched display metric labels');
}

replaceExact(
  '<span>{metric.label}</span>',
  '<span>{displayMetricLabel(metric)}</span>',
  'compact tile display label'
);

replaceExact(
  '      ? { label: "EMPTY", className: "metric-status-alert" }\n      : { label: "FULL", className: "metric-status-ok" };',
  '      ? { label: "EMPTY", className: "metric-status-ok" }\n      : { label: "FULL", className: "metric-status-alert" };',
  'trough status colors'
);

replaceExact(
  'const nurseryChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["nursery_ph", "nursery_ec", "nursery_water_temperature"]));\n  const nurseryLevels = monitoringMetrics.filter((metric) => isTankDepthMetric(metric) || isTroughLevelMetric(metric));',
  'const nurseryChemistry = monitoringMetrics.filter((metric) => aliasIn(metric, ["nursery_ph", "nursery_ec", "nursery_tank_depth", "nursery_water_temperature"]));\n  const nurseryLevels = monitoringMetrics.filter((metric) => isTroughLevelMetric(metric));',
  'nursery tank depth placement'
);

fs.writeFileSync(dashboardPath, dashboard);
