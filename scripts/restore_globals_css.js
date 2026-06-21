const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cssPath = path.join(__dirname, "..", "app", "globals.css");
const sourceCommit = "7170bf8373963dbaae0c75302f0c7f6896bd58de";
const repoPath = "app/globals.css";

const overrides = `

/* OpenCEA cultivation recipe compact overrides */
.cultivation-side-irrigation-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cultivation-side-irrigation-card {
  min-height: auto;
}

.cultivation-side-irrigation-card .cultivation-row-code {
  width: auto;
  min-width: 72px;
  padding: 0 12px;
  font-size: 0.98rem;
}

.compact-dosing-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.compact-dosing-grid .recipe-trough-metric {
  min-height: 78px;
  padding: 9px 10px;
}

.compact-dosing-grid .recipe-trough-metric span,
.compact-dosing-grid .recipe-trough-metric small {
  font-size: 0.74rem;
}

.compact-dosing-grid .recipe-trough-metric strong {
  font-size: 0.9rem;
  margin-top: 4px;
}

.compact-dosing-grid .recipe-status-pill {
  padding: 0.28rem 0.5rem;
  font-size: 0.72rem;
  gap: 5px;
}

.compact-dosing-grid .recipe-status-dot {
  width: 0.52rem;
  height: 0.52rem;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}

.compact-dosing-grid .recipe-status-pill.enabled .recipe-status-dot {
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
}

@media (max-width: 900px) {
  .cultivation-side-irrigation-grid,
  .compact-dosing-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .cultivation-side-irrigation-grid,
  .compact-dosing-grid {
    grid-template-columns: 1fr;
  }
}
`;

try {
  const restored = execFileSync("git", ["show", `${sourceCommit}:${repoPath}`], { encoding: "utf8" });
  const withoutDuplicateOverride = restored.replace(/\n\/\* OpenCEA cultivation recipe compact overrides \*\/[\s\S]*$/m, "");
  fs.writeFileSync(cssPath, withoutDuplicateOverride.trimEnd() + overrides);
  console.log(`Restored ${repoPath} from ${sourceCommit} and applied cultivation compact overrides.`);
} catch (error) {
  console.error("Failed to restore globals.css from git history.");
  throw error;
}
