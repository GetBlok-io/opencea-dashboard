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

const valueHelpers = String.raw`function formatOneDecimal(value: number) {
  return value.toFixed(1);
}

function formatPercent(value: number) {
  return formatOneDecimal(value) + "%";
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

function formatValue(value: unknown, metric: Metric, temperature