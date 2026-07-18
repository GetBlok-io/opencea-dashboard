const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, '..', 'components', 'Dashboard.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
let globals = fs.readFileSync(globalsPath, 'utf8');

const oldSection = '<section className="monitoring-zone-stack">';
const newSection = '<section className="monitoring-zone-stack compact-monitoring-columns">';
if (dashboard.includes(oldSection)) {
  dashboard = dashboard.replace(oldSection, newSection);
  console.log('Patched compact monitoring section columns class.');
} else {
  console.log('Skipped compact monitoring section columns class.');
}

const marker = 'Issue 21 compact