const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

function patchRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.log('Skipped