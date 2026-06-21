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

if (!recipe.includes('import NurseryRecipeGroups from "./NurseryRecipeGroups";')) {
  recipe = recipe.replace('import { useEffect, useMemo, useState } from "react";\n', 'import { useEffect, useMemo, useState } from "react";\nimport NurseryRecipeGroups from "./NurseryRecipeGroups";\n');
  fs.writeFileSync(recipePath, recipe);
  console.log("Added NurseryRecipeGroups import.");
}

recipe = fs.readFileSync(recipePath, "utf8");
const clockFunctionRegex = /function formatClockFromUtcSeconds\(value: number \| null\) \{[\s\S]*?\n\}/;
const directClockFunction = [
  'function formatClockFromUtcSeconds(value: number | null) {',
  '  if (value === null) return "—";',
  '  const seconds = ((Math.round(value) % 86400) + 86400) % 86400;',
  '  const date = new Date(Date.UTC(2026, 5, 1, 0, 0, seconds));',
  '  return new Intl.DateTimeFormat(undefined, {',
  '    hour: "numeric",',
  '    minute: "2-digit",',
  '    timeZone: process.env.NEXT_PUBLIC_FARM_TIME_ZONE ?? "America/New_York",',
  '  }).format(date);',
  '}',
].join("\n");

if (!recipe.includes('timeZone: process.env.NEXT_PUBLIC_FARM_TIME_ZONE ?? "America/New_York"')) {
  if (!clockFunctionRegex.test(recipe)) {
    throw new Error("Could not find formatClockFromUtcSeconds in RecipeDashboard.tsx");
  }
  recipe = recipe.replace(clockFunctionRegex, directClockFunction);
  fs.writeFileSync(recipePath, recipe);
  console.log("Patched recipe clock formatting to farm timezone.");
} else {
  console.log("Recipe clock formatting already patched.");
}

recipe = fs.readFileSync(recipePath, "utf8");
const zoneTargetGrid = '{targets && targets.length > 0 ? <TargetGrid cards={targets} /> : null}';
const zoneTargetTable = '{targets && targets.length > 0 ? <ClimateMatrix cards={targets} /> : null}';
if (recipe.includes(zoneTargetGrid)) {
  recipe = recipe.replace(zoneTargetGrid, zoneTargetTable);
  fs.writeFileSync(recipePath, recipe);
  console.log("Patched zone target sections to use day/night tables.");
} else if (recipe.includes(zoneTargetTable)) {
  console.log("Zone target sections already use day/night tables.");
} else {
  console.log("Zone target section pattern not found; leaving unchanged.");
}

recipe = fs.readFileSync(recipePath, "utf8");
const nurseryZoneBlock = `      <ZoneRecipePanel
        zone="Nursery"
        title="Nursery recipe"
        copy="Nursery chemistry, irrigation, lighting, recirculation, and dose timing values."
        targets={parsed.nurseryTargets}
        timingSections={[
          { title: "Watering and operation", cards: parsed.nurseryTiming },
          { title: "Lighting", cards: parsed.nurseryLighting },
          { title: "Dosing summary", cards: parsed.nurseryDosing },
        ]}
      />`;
const nurseryGroupedBlock = `      <NurseryRecipeGroups
        targets={parsed.nurseryTargets}
        timing={parsed.nurseryTiming}
        lighting={parsed.nurseryLighting}
      />`;
if (recipe.includes(nurseryZoneBlock)) {
  recipe = recipe.replace(nurseryZoneBlock, nurseryGroupedBlock);
  fs.writeFileSync(recipePath, recipe);
  console.log("Patched Nursery section into top/bottom trough groups.");
} else if (recipe.includes(nurseryGroupedBlock)) {
  console.log("Nursery section already grouped by trough.");
} else {
  console.log("Nursery section pattern not found; leaving unchanged.");
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

.recipe-zone-panel > .recipe-climate-matrix {
  margin-top: 12px;
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

css = fs.readFileSync(cssPath, "utf8");
const nurseryTroughMarker = "/* OpenCEA nursery trough recipe grouping */";
if (!css.includes(nurseryTroughMarker)) {
  css += `

${nurseryTroughMarker}
.recipe-nursery-panel {
  display: grid;
  gap: 16px;
}

.recipe-trough-stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.recipe-trough-group {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  padding: 14px;
}

.recipe-trough-header h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}

.recipe-trough-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.recipe-trough-metric {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  padding: 12px;
}

.recipe-trough-metric span,
.recipe-trough-metric small {
  color: var(--muted);
}

.recipe-trough-metric strong {
  display: block;
  margin-top: 6px;
  font-size: 1rem;
}

.recipe-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin-top: 8px;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.84rem;
  font-weight: 900;
  letter-spacing: 0.03em;
}

.recipe-status-pill.enabled {
  background: rgba(34, 197, 94, 0.14);
  color: var(--good);
}

.recipe-status-pill.disabled,
.recipe-status-pill.unknown {
  background: rgba(245, 158, 11, 0.16);
  color: var(--warning);
}

.recipe-status-dot {
  width: 0.68rem;
  height: 0.68rem;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.12);
}

.recipe-status-pill.enabled .recipe-status-dot {
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.12);
}

.recipe-trough-lighting {
  margin-top: 14px;
}

.recipe-trough-lighting h4 {
  margin: 0 0 10px;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
}

@media (max-width: 900px) {
  .recipe-trough-stack {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .recipe-trough-grid {
    grid-template-columns: 1fr;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied nursery trough grouping CSS.");
} else {
  console.log("Nursery trough grouping CSS already applied.");
}
