const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

function patchRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.log('Skipped ' + label);
    return source;
  }
  console