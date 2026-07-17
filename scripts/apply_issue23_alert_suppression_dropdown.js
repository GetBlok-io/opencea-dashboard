const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
const globalsPath = path.join(__dirname, "..", "app", "globals.css");
let source = fs.readFileSync(dashboardPath, "utf8");

function patchRegex(regex, replacement, label) {
  if (!regex.test(source)) {
    console.log(`${label} already present or pattern not found.`);
    return false;
  }
  source = source.replace(regex, replacement);
  console.log(`Patched ${label}.`);
  return true;
}

function ensureSuppressionOptions() {
  if (source.includes("const ALERT_SUPPRESSION_OPTIONS = [")) {
    console.log("Alert suppression options already present.");
    return;
  }

  const block = `const ALERT_SUPPRESSION_OPTIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "12 hours", minutes: 720 },
  { label: "24 hours", minutes: 1440 },
] as const;

`;

  const afterPriorities = /(const ALERT_PRIORITIES = \["info", "warning", "critical", "emergency"\] as const;\r?\n\r?\n?)/;
  if (afterPriorities.test(source)) {
    source = source.replace(afterPriorities, `$1${block}`);
    console.log("Patched alert suppression options.");
    return;
  }

  const beforeMetrics = /(const ALERT_METRIC_OPTIONS = \[)/;
  if (beforeMetrics.test(source)) {
    source = source.replace(beforeMetrics, `${block}$1`);
    console.log("Patched alert suppression options fallback.");
    return;
  }

  throw new Error("Could not insert ALERT_SUPPRESSION_OPTIONS.");
}

function ensureSuppressionState() {
  const hasState = source.includes("const [suppressDurationByEventId, setSuppressDurationByEventId]");
  const hasHelper = source.includes("function selectedSuppressionMinutes(eventId: string)");

  if (hasState && hasHelper) {
    console.log("Alert suppression duration state already present.");
    return;
  }

  const insertBlock = `  const [suppressDurationByEventId, setSuppressDurationByEventId] = useState<Record<string, number>>({});

  function selectedSuppressionMinutes(eventId: string) {
    return suppressDurationByEventId[eventId] ?? ALERT_SUPPRESSION_OPTIONS[0].minutes;
  }
`;

  if (!hasState && !hasHelper) {
    const withEditingRule = /(  const \[editingRuleId, setEditingRuleId\] = useState<string \| null>\(null\);\r?\n)(  const editingRule = rules\.find\(\(rule\) => rule\.id === editingRuleId\) \?\? null;\r?\n)/;
    if (withEditingRule.test(source)) {
      source = source.replace(withEditingRule, `$1${insertBlock}$2`);
      console.log("Patched alert suppression duration state.");
      return;
    }

    const afterEditingRuleId = /(  const \[editingRuleId, setEditingRuleId\] = useState<string \| null>\(null\);\r?\n)/;
    if (afterEditingRuleId.test(source)) {
      source = source.replace(afterEditingRuleId, `$1${insertBlock}`);
      console.log("Patched alert suppression duration fallback state.");
      return;
    }
  }

  if (hasHelper && !hasState) {
    const beforeHelper = /(\r?\n  function selectedSuppressionMinutes\(eventId: string\) \{)/;
    if (beforeHelper.test(source)) {
      source = source.replace(
        beforeHelper,
        `\n  const [suppressDurationByEventId, setSuppressDurationByEventId] = useState<Record<string, number>>({});\n$1`,
      );
      console.log("Patched missing suppression duration state.");
      return;
    }
  }

  if (hasState && !hasHelper) {
    const afterState = /(  const \[suppressDurationByEventId, setSuppressDurationByEventId\] = useState<Record<string, number>>\(\{\}\);\r?\n)/;
    if (afterState.test(source)) {
      source = source.replace(
        afterState,
        `$1\n  function selectedSuppressionMinutes(eventId: string) {\n    return suppressDurationByEventId[eventId] ?? ALERT_SUPPRESSION_OPTIONS[0].minutes;\n  }\n`,
      );
      console.log("Patched missing suppression duration helper.");
      return;
    }
  }

  throw new Error("Could not insert suppression duration state/helper.");
}

function ensureSuppressFunction() {
  const newSuppressFunction = `  async function suppressAlertEvent(event: AlertEventRow) {
    await updateAlertEvent(event, "suppress", selectedSuppressionMinutes(event.id));
  }
`;

  const hasNewFunction = source.includes('await updateAlertEvent(event, "suppress", selectedSuppressionMinutes(event.id));');
  if (hasNewFunction) {
    console.log("Prompt suppression handler already replaced.");
    return;
  }

  const patched = patchRegex(
    /  async function suppressAlertEvent\(event: AlertEventRow\) \{[\s\S]*?  async function toggleRuleEnabled\(rule: AlertRuleRow\) \{/,
    `${newSuppressFunction}\n  async function toggleRuleEnabled(rule: AlertRuleRow) {`,
    "prompt suppression handler",
  );

  if (!patched) {
    throw new Error("Could not replace prompt suppression handler.");
  }
}

function ensureSuppressDropdown() {
  if (source.includes('className="suppression-control"')) {
    console.log("Suppress action dropdown already present.");
    return;
  }

  const newSuppressControl = `                  <span className="suppression-control">
                    <select
                      className="suppression-select"
                      value={selectedSuppressionMinutes(event.id)}
                      onChange={(changeEvent) => {
                        const nextMinutes = Number(changeEvent.target.value);
                        setSuppressDurationByEventId((current) => ({
                          ...current,
                          [event.id]: nextMinutes,
                        }));
                      }}
                      title="Suppression duration"
                      aria-label={\`Suppression duration for \${event.rule_name}\`}
                    >
                      {ALERT_SUPPRESSION_OPTIONS.map((option) => (
                        <option key={option.minutes} value={option.minutes}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button suppress-icon-button"
                      onClick={() => void suppressAlertEvent(event)}
                      title={\`Suppress alert for \${selectedSuppressionMinutes(event.id) / 60} hour\${selectedSuppressionMinutes(event.id) === 60 ? "" : "s"}\`}
                      aria-label={\`Suppress \${event.rule_name}\`}
                    >
                      ⏸
                    </button>
                  </span>`;

  const patched = patchRegex(
    /                  <button\r?\n                    type="button"\r?\n                    className="icon-button suppress-icon-button"\r?\n                    onClick=\{\(\) => void suppressAlertEvent\(event\)\}\r?\n                    title="Suppress alert"\r?\n                    aria-label=\{`Suppress \$\{event\.rule_name\}`\}\r?\n                  >\r?\n                    ⏸\r?\n                  <\/button>/,
    newSuppressControl,
    "suppress action dropdown",
  );

  if (!patched) {
    throw new Error("Could not replace suppress action button.");
  }
}

function ensureCss() {
  let css = fs.readFileSync(globalsPath, "utf8");
  if (css.includes(".suppression-control")) {
    console.log("Alert suppression dropdown CSS already present.");
    return;
  }

  css += `

.suppression-control {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.suppression-select {
  min-width: 5.6rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  color: inherit;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}
`;
  fs.writeFileSync(globalsPath, css);
  console.log("Patched alert suppression dropdown CSS.");
}

ensureSuppressionOptions();
ensureSuppressionState();
ensureSuppressFunction();
ensureSuppressDropdown();

const requiredMarkers = [
  "const ALERT_SUPPRESSION_OPTIONS = [",
  "const [suppressDurationByEventId, setSuppressDurationByEventId]",
  "function selectedSuppressionMinutes(eventId: string)",
  'className="suppression-control"',
];

const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
if (missingMarkers.length > 0) {
  throw new Error(`Issue #23 repair incomplete. Missing: ${missingMarkers.join(", ")}`);
}

fs.writeFileSync(dashboardPath, source);
ensureCss();
