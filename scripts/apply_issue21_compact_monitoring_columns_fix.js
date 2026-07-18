const fs = require('fs');
const path = require('path');

const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');
let globals = fs.readFileSync(globalsPath, 'utf8');

const override = `

/* Issue 21 compact monitoring desktop column fix */
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

@media