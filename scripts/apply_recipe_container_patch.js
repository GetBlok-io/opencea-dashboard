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

.recipe-target-grid-compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.recipe-target-card-compact {
  padding: 12px;
  min-height: auto;
}

.recipe-target-card-compact > span {
  color: var(--text);
  font-size: 0.92rem;
  font-weight: 900;
}

.recipe-target-card-compact .target-pair {
  gap: 8px;
  margin-top: 8px;
}

.recipe-target-card-compact .target-pair div {
  padding: 8px;
}

.recipe-target-card-compact .target-pair strong {
  font-size: 0.98rem;
  white-space: nowrap;
}

.recipe-schedule-inline {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.recipe-timing-grid-compact {
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 10px;
}

.recipe-timing-card-compact {
  padding: 10px 12px;
  min-height: auto;
}

.recipe-timing-card-compact strong {
  font-size: 1rem;
}

@media (max-width: 900px) {
  .recipe-target-grid-compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .recipe-target-grid-compact,
  .recipe-timing-grid-compact {
    grid-template-columns: 1fr;
  }

  .recipe-target-card-compact .target-pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .recipe-target-card-compact .target-pair {
    grid-template-columns: 1fr;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied compact container recipe CSS.");
} else {
  console.log("Compact container recipe CSS already applied.");
}
