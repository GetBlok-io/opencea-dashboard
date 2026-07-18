const fs = require('fs');
const path = require('path');

const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');
let globals = fs.readFileSync(globalsPath, 'utf8');

const marker = 'Issue 21 compact monitoring desktop column fix';
const override = `

/* ${marker} */
@media (min-width: 900px) {
  .monitoring-grid {
    grid-template-columns: repeat(3, minmax(260px, 1fr)) !important;
    align-items: start;
  }

  .compact-zone-panel {
    min-height: 100%;
  }

  .compact-metric-list {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 899px) {
  .monitoring-grid {
    grid-template-columns: 1fr !important;
  }

  .compact-metric-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .compact-metric-list {
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

fs.writeFileSync(globalsPath, globals);
