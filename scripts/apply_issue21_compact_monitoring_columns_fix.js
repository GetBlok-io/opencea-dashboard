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

const marker = 'Issue 21 compact monitoring desktop column fix';
const override = `

/* ${marker} */
@media (min-width: 900px) {
  .compact-monitoring-columns {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(260px, 1fr)) !important;
    gap: 1rem !important;
    align-items: start !important;
  }

  .compact-monitoring-columns > .compact-zone-panel {
    min-width: 0;
    min-height: 100%;
  }

  .compact-monitoring-columns .compact-metric-list {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 899px) {
  .compact-monitoring-columns {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }

  .compact-monitoring-columns .compact-metric-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .compact-monitoring-columns .compact-metric-list {
    grid-template-columns: 1fr !important;
  }
}
`;

if (!globals.includes(marker)) {
  globals += override;
  console.log('Patched compact monitoring desktop columns.');
} else {
  console.log('Skipped compact monitoring desktop columns.');
}

fs.writeFileSync(dashboardPath, dashboard);
fs.writeFileSync(globalsPath, globals);
