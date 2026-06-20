const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
let dashboard = fs.readFileSync(dashboardPath, "utf8");

if (dashboard.includes("return <RecipeDashboard />;")) {
  dashboard = dashboard.replace(
    "function RecipeFoundation() {\n  return <RecipeDashboard />;\n}",
    "function RecipeFoundation({ temperatureUnit }: { temperatureUnit: TemperatureUnit }) {\n  return <RecipeDashboard temperatureUnit={temperatureUnit} />;\n}",
  );
  console.log("Updated RecipeFoundation to pass temperature unit.");
}

if (dashboard.includes('{activeSection === "recipe" ? <RecipeFoundation /> : null}')) {
  dashboard = dashboard.replace(
    '{activeSection === "recipe" ? <RecipeFoundation /> : null}',
    '{activeSection === "recipe" ? <RecipeFoundation temperatureUnit={temperatureUnit} /> : null}',
  );
  console.log("Updated RecipeFoundation render with temperature unit.");
}

fs.writeFileSync(dashboardPath, dashboard);

const recipePath = path.join(__dirname, "..", "components", "RecipeDashboard.tsx");
let recipe = fs.readFileSync(recipePath, "utf8");
const clockFunctionRegex = /function formatClockFromUtcSeconds\(value: number \| null\) \{[\s\S]*?\n\}/;
const directClockFunction = `function formatClockFromUtcSeconds(value: number | null) {
  if (value === null) return "—";
  const totalSeconds = ((Math.round(value) % 86400) + 86400) % 86400;
  const hours24 = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}`;

if (!recipe.includes('const totalSeconds = ((Math.round(value) % 86400) + 86400) % 86400;')) {
  if (!clockFunctionRegex.test(recipe)) {
    throw new Error("Could not find formatClockFromUtcSeconds in RecipeDashboard.tsx");
  }
  recipe = recipe.replace(clockFunctionRegex, directClockFunction);
  fs.writeFileSync(recipePath, recipe);
  console.log("Patched recipe clock formatting to avoid browser timezone shifting.");
} else {
  console.log("Recipe clock formatting already patched.");
}

const cssPath = path.join(__dirname, "..", "app", "globals.css");
let css = fs.readFileSync(cssPath, "utf8");
const marker = "/* OpenCEA compact container recipe */";

if (!css.includes(marker)) {
  css += `

${marker}
.recipe-container-panel {
  display: grid;
  gap: 14px;
}

.recipe-container-panel .recipe-section-header p {
  margin-bottom: 0;
}

.recipe-container-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.45fr);
  gap: 14px;
  align-items: stretch;
}

.recipe-climate-matrix {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.climate-matrix-header,
.climate-matrix-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr);
  gap: 10px;
  align-items: center;
  padding: 11px 14px;
}

.climate-matrix-header {
  background: rgba(56, 189, 248, 0.08);
  border-bottom: 1px solid var(--border);
}

.climate-matrix-header span,
.climate-matrix-header strong,
.climate-matrix-row span {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.climate-matrix-row + .climate-matrix-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.climate-matrix-row strong {
  color: var(--text);
  font-size: 1.05rem;
  line-height: 1.2;
}

.recipe-timing-grid-compact {
  grid-template-columns: 1fr;
  gap: 10px;
  height: 100%;
}

.recipe-timing-card-compact {
  display: grid;
  align-content: center;
  padding: 12px 14px;
  min-height: auto;
}

.recipe-timing-card-compact strong {
  font-size: 1.08rem;
}

.recipe-timing-card-compact small {
  margin-top: 3px;
}

@media (max-width: 1000px) {
  .recipe-container-layout {
    grid-template-columns: 1fr;
  }

  .recipe-timing-grid-compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .climate-matrix-header,
  .climate-matrix-row {
    grid-template-columns: minmax(94px, 0.9fr) repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
  }

  .climate-matrix-row strong {
    font-size: 0.94rem;
  }

  .recipe-timing-grid-compact {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .climate-matrix-header,
  .climate-matrix-row {
    grid-template-columns: 1fr;
  }

  .climate-matrix-header strong {
    display: none;
  }

  .climate-matrix-row strong:nth-child(2)::before {
    content: "Day: ";
    color: var(--muted);
    font-size: 0.78rem;
  }

  .climate-matrix-row strong:nth-child(3)::before {
    content: "Night: ";
    color: var(--muted);
    font-size: 0.78rem;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied compact container recipe CSS.");
} else {
  console.log("Compact container recipe CSS already applied.");
}

css = fs.readFileSync(cssPath, "utf8");
const mobileTableMarker = "/* OpenCEA mobile climate table override */";
if (!css.includes(mobileTableMarker)) {
  css += `

${mobileTableMarker}
@media (max-width: 420px) {
  .recipe-climate-matrix .climate-matrix-header,
  .recipe-climate-matrix .climate-matrix-row {
    grid-template-columns: minmax(86px, 0.9fr) minmax(82px, 1fr) minmax(82px, 1fr);
    gap: 6px;
    padding: 10px 8px;
  }

  .recipe-climate-matrix .climate-matrix-header strong {
    display: block;
  }

  .recipe-climate-matrix .climate-matrix-header span,
  .recipe-climate-matrix .climate-matrix-header strong,
  .recipe-climate-matrix .climate-matrix-row span {
    font-size: 0.72rem;
  }

  .recipe-climate-matrix .climate-matrix-row strong {
    font-size: 0.82rem;
  }

  .recipe-climate-matrix .climate-matrix-row strong:nth-child(2)::before,
  .recipe-climate-matrix .climate-matrix-row strong:nth-child(3)::before {
    content: none;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied mobile climate table override.");
} else {
  console.log("Mobile climate table override already applied.");
}
