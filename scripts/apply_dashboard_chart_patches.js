const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
let source = fs.readFileSync(dashboardPath, "utf8");

const recipeImport = 'import RecipeDashboard from "./RecipeDashboard";';
if (!source.includes(recipeImport)) {
  source = source.replace('} from "recharts";\n', `} from "recharts";\n${recipeImport}\n`);
  fs.writeFileSync(dashboardPath, source);
  console.log("Added RecipeDashboard import.");
}

source = fs.readFileSync(dashboardPath, "utf8");
if (!source.includes("return <RecipeDashboard />;")) {
  const recipeFoundationRegex = /function RecipeFoundation\(\) \{[\s\S]*?\n\}\n\nexport default function Dashboard/;
  if (!recipeFoundationRegex.test(source)) {
    throw new Error("Could not find RecipeFoundation block in Dashboard.tsx");
  }
  source = source.replace(
    recipeFoundationRegex,
    'function RecipeFoundation() {\n  return <RecipeDashboard />;\n}\n\nexport default function Dashboard',
  );
  fs.writeFileSync(dashboardPath, source);
  console.log("Replaced placeholder recipe section with RecipeDashboard.");
}

source = fs.readFileSync(dashboardPath, "utf8");
const marker = '  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure"';

if (!source.includes(marker)) {
  const search = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n];';
  const replacement = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_right_send_pressure", title: "Right Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n];';

  if (!source.includes(search)) {
    throw new Error("Could not find cultivation tank depth chart block in Dashboard.tsx");
  }

  source = source.replace(search, replacement);
  fs.writeFileSync(dashboardPath, source);
  console.log("Applied dashboard chart patch for cultivation send pressure cards.");
} else {
  console.log("Dashboard chart patch already applied.");
}

const cssPath = path.join(__dirname, "..", "app", "globals.css");
let css = fs.readFileSync(cssPath, "utf8");
const cssMarker = "/* OpenCEA status-card and mobile refinements */";

if (!css.includes(cssMarker)) {
  css += `

${cssMarker}
.nested-metric,
.trough-level-grid .metric {
  display: grid;
  gap: 8px;
  align-content: center;
  min-height: 104px;
  padding: 14px;
}

.nested-metric span,
.trough-level-grid .metric span {
  color: var(--text);
  font-size: 0.92rem;
  font-weight: 800;
  line-height: 1.2;
}

.nested-metric strong,
.trough-level-grid .metric strong {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin-top: 0;
  border-radius: 999px;
  padding: 0.42rem 0.72rem;
  background: rgba(34, 197, 94, 0.14);
  color: var(--good);
  font-size: 0.95rem;
  font-weight: 900;
  letter-spacing: 0.03em;
}

.nested-metric strong::before,
.trough-level-grid .metric strong::before {
  content: "";
  width: 0.72rem;
  height: 0.72rem;
  border-radius: 999px;
  background: var(--good);
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.12);
}

.nested-metric strong.alert-value,
.trough-level-grid .metric strong.alert-value {
  background: rgba(245, 158, 11, 0.16);
  color: var(--warning);
}

.nested-metric strong.alert-value::before,
.trough-level-grid .metric strong.alert-value::before {
  background: var(--warning);
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.13);
}

.nested-metric .module-id,
.trough-level-grid .module-id {
  display: none;
}

@media (max-width: 760px) {
  .page-shell {
    width: min(100% - 20px, 1320px);
    padding: 18px 0 28px;
  }

  .hero {
    gap: 14px;
    margin-bottom: 18px;
  }

  h1 {
    font-size: clamp(2rem, 11vw, 3rem);
  }

  .hero-copy {
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .hero-actions {
    width: 100%;
  }

  .toggle-group {
    width: 100%;
    justify-content: stretch;
  }

  button.toggle {
    flex: 1 1 0;
    padding: 0.72rem 0.6rem;
  }

  .hero-actions > button:not(.toggle) {
    width: 100%;
  }

  .summary-card {
    padding: 14px;
  }

  .summary-card strong {
    font-size: 1.35rem;
  }

  .wide-summary strong {
    font-size: 0.92rem;
  }

  .subheader {
    gap: 4px;
    margin: 18px 0 12px;
    font-size: 0.82rem;
  }

  .subheader p {
    margin: 0;
  }

  .monitoring-zone-stack {
    gap: 16px;
  }

  .monitoring-zone-panel,
  .foundation-card {
    border-radius: 18px;
    padding: 16px;
  }

  .zone-card-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .metric-count {
    align-self: flex-start;
  }

  .chart-card {
    padding: 13px;
  }

  .chart-card-header {
    flex-direction: column;
    gap: 8px;
  }

  .chart-card-header strong {
    font-size: 1.15rem;
  }

  .chart-frame,
  .chart-empty {
    min-height: 132px;
  }

  .metric-grid,
  .nested-metric-grid,
  .trough-level-grid,
  .control-metric-grid,
  .zone-chart-grid,
  .zone-chart-grid-nursery,
  .zone-chart-grid-cultivation {
    grid-template-columns: 1fr;
  }

  .metric,
  .nested-metric {
    min-height: auto;
  }

  .switch-metric {
    flex-direction: row;
    align-items: center;
  }

  .switch-wrap {
    margin-left: auto;
  }
}

@media (max-width: 420px) {
  .page-shell {
    width: min(100% - 14px, 1320px);
  }

  .monitoring-zone-panel,
  .foundation-card,
  .chart-card,
  .metric,
  .nested-metric {
    border-radius: 14px;
  }

  .switch-metric {
    flex-direction: column;
    align-items: flex-start;
  }

  .switch-wrap {
    margin-left: 0;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied status-card and mobile CSS refinements.");
} else {
  console.log("Status-card and mobile CSS refinements already applied.");
}

css = fs.readFileSync(cssPath, "utf8");
const recipeCssMarker = "/* OpenCEA recipe dashboard */";
if (!css.includes(recipeCssMarker)) {
  css += `

${recipeCssMarker}
.recipe-dashboard {
  display: grid;
  gap: 20px;
  margin-top: 18px;
}

.recipe-hero-panel,
.recipe-panel,
.recipe-loading {
  background: rgba(17, 24, 39, 0.86);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
  padding: 22px;
}

.recipe-hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.recipe-hero-panel h2,
.recipe-section-header h2 {
  margin: 0;
}

.recipe-hero-panel p,
.recipe-section-header p {
  color: var(--muted);
  line-height: 1.55;
}

.recipe-meta-grid,
.recipe-target-grid,
.recipe-timing-grid {
  display: grid;
  gap: 12px;
}

.recipe-meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.recipe-meta-grid div,
.recipe-target-card,
.recipe-timing-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}

.recipe-meta-grid span,
.recipe-target-card span,
.recipe-timing-card span,
.target-pair small,
.recipe-timing-card small {
  color: var(--muted);
}

.recipe-meta-grid strong {
  display: block;
  margin-top: 6px;
  font-size: 0.88rem;
  line-height: 1.3;
  word-break: break-word;
}

.recipe-target-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.recipe-timing-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.target-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.target-pair div {
  border-radius: 12px;
  background: rgba(56, 189, 248, 0.08);
  padding: 10px;
}

.target-pair strong,
.recipe-timing-card strong {
  display: block;
  margin-top: 4px;
  font-size: 1.1rem;
  line-height: 1.25;
}

.recipe-target-card p {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.recipe-subtitle {
  margin: 20px 0 10px;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 0.86rem;
  letter-spacing: 0.06em;
}

.recipe-loading {
  color: var(--muted);
}

@media (max-width: 1000px) {
  .recipe-hero-panel,
  .recipe-target-grid,
  .recipe-timing-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .recipe-hero-panel,
  .recipe-meta-grid,
  .recipe-target-grid,
  .recipe-timing-grid {
    grid-template-columns: 1fr;
  }

  .recipe-hero-panel,
  .recipe-panel,
  .recipe-loading {
    border-radius: 18px;
    padding: 16px;
  }

  .target-pair {
    grid-template-columns: 1fr;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied recipe dashboard CSS.");
} else {
  console.log("Recipe dashboard CSS already applied.");
}
