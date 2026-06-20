const fs = require("fs");
const path = require("path");

const recipePath = path.join(__dirname, "..", "components", "RecipeDashboard.tsx");
let recipe = fs.readFileSync(recipePath, "utf8");

if (!recipe.includes("dayStart,")) {
  recipe = recipe.replace("climateTargets,\n      nurseryTargets,", "climateTargets,\n      dayStart,\n      nurseryTargets,");
  console.log("Added dayStart to parsed recipe object.");
}

if (!recipe.includes("dayStart={parsed.dayStart}")) {
  recipe = recipe.replace(
    "        lighting={parsed.nurseryLighting}\n      />",
    "        lighting={parsed.nurseryLighting}\n        dayStart={parsed.dayStart}\n      />",
  );
  console.log("Passed dayStart to NurseryRecipeGroups.");
}

fs.writeFileSync(recipePath, recipe);

const cssPath = path.join(__dirname, "..", "app", "globals.css");
let css = fs.readFileSync(cssPath, "utf8");
const marker = "/* OpenCEA nursery light cards */";

if (!css.includes(marker)) {
  css += `

${marker}
.recipe-light-card {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  padding: 14px;
}

.recipe-light-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.recipe-light-card-header h4 {
  margin: 0;
  color: var(--text);
  font-size: 1rem;
  font-weight: 800;
}

.recipe-light-card-header span {
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.14);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 900;
  padding: 0.35rem 0.65rem;
  white-space: nowrap;
}

.recipe-light-channel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.recipe-light-channel {
  display: grid;
  gap: 9px;
}

.recipe-light-channel h5 {
  margin: 0 0 2px;
  text-align: center;
  font-size: 1rem;
  font-weight: 900;
}

.recipe-light-channel h5.light-red {
  color: #fb7185;
}

.recipe-light-channel h5.light-blue {
  color: #38bdf8;
}

.recipe-light-time-row {
  display: grid;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 7px;
}

.recipe-light-time-row span {
  color: var(--muted);
  font-size: 0.78rem;
}

.recipe-light-time-row strong {
  color: var(--text);
  font-size: 1rem;
  line-height: 1.15;
}

.recipe-light-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 0.84rem;
}

.recipe-light-footer strong {
  color: var(--text);
  font-size: 0.9rem;
}

.recipe-light-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px;
}

.recipe-light-summary span {
  color: var(--muted);
  font-size: 0.84rem;
}

.recipe-light-summary strong {
  color: var(--text);
}

@media (max-width: 520px) {
  .recipe-light-channel-grid,
  .recipe-light-summary {
    grid-template-columns: 1fr;
  }
}
`;
  fs.writeFileSync(cssPath, css);
  console.log("Applied nursery light card CSS.");
} else {
  console.log("Nursery light card CSS already applied.");
}
