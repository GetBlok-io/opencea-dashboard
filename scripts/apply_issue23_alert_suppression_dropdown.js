const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
const globalsPath = path.join(__dirname, "..", "app", "globals.css");
let source = fs.readFileSync(dashboardPath, "utf8");

function patchSource(search, replacement, label) {
  if (!source.includes(search)) {
    console.log(`${label} already present or pattern not found.`);
    return false;
  }
  source = source.replace(search, replacement);
  console.log(`Patched ${label}.`);
  return true;
}

function patchRegex(regex, replacement, label) {
  if (!regex.test(source)) {
    console.log(`${label} already present or pattern not found.`);
    return false;
  }
  source = source.replace(regex, replacement);
  console.log(`Patched ${label}.`);
  return true;
}

if (!source.includes("const ALERT_SUPPRESSION_OPTIONS = [")) {
  patchSource(
    'const ALERT_PRIORITIES = ["info", "warning", "critical", "emergency"] as const;\n',
    'const ALERT_PRIORITIES = ["info", "warning", "critical", "emergency"] as const;\n\nconst ALERT_SUPPRESSION_OPTIONS = [\n  { label: "1 hour", minutes: 60 },\n  { label: "12 hours", minutes: 720 },\n  { label: "24 hours", minutes: 1440 },\n] as const;\n',
    "alert suppression options",
  );
} else {
  console.log("Alert suppression options already present.");
}

if (!source.includes("const [suppressDurationByEventId, setSuppressDurationByEventId]")) {
  const stateBlock =
    '  const [suppressDurationByEventId, setSuppressDurationByEventId] = useState<Record<string, number>>({});\n';
  const helperBlock =
    '\n  function selectedSuppressionMinutes(eventId: string) {\n' +
    '    return suppressDurationByEventId[eventId] ?? ALERT_SUPPRESSION_OPTIONS[0].minutes;\n' +
    '  }\n';

  const patchedState = patchRegex(
    /(  const \[editingRuleId, setEditingRuleId\] = useState<string \| null>\(null\);\r?\n)(  const editingRule = rules\.find\(\(rule\) => rule\.id === editingRuleId\) \?\? null;\r?\n)/,
    `$1${stateBlock}$2${helperBlock}`,
    "alert suppression duration state",
  );

  if (!patchedState) {
    patchRegex(
      /(  const \[editingRuleId, setEditingRuleId\] = useState<string \| null>\(null\);\r?\n)/,
      `$1${stateBlock}${helperBlock}`,
      "alert suppression duration fallback state",
    );
  }
} else {
  console.log("Alert suppression duration state already present.");
}

const newSuppressFunction = `  async function suppressAlertEvent(event: AlertEventRow) {
    await updateAlertEvent(event, "suppress", selectedSuppressionMinutes(event.id));
  }
`;

if (!source.includes('selectedSuppressionMinutes(event.id)')) {
  patchRegex(
    /  async function suppressAlertEvent\(event: AlertEventRow\) \{[\s\S]*?  async function toggleRuleEnabled\(rule: AlertRuleRow\) \{/,
    `${newSuppressFunction}\n  async function toggleRuleEnabled(rule: AlertRuleRow) {`,
    "prompt suppression handler",
  );
} else {
  console.log("Prompt suppression handler already replaced.");
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

if (!source.includes('className="suppression-control"')) {
  patchRegex(
    /                  <button\r?\n                    type="button"\r?\n                    className="icon-button suppress-icon-button"\r?\n                    onClick=\{\(\) => void suppressAlertEvent\(event\)\}\r?\n                    title="Suppress alert"\r?\n                    aria-label=\{`Suppress \$\{event\.rule_name\}`\}\r?\n                  >\r?\n                    ⏸\r?\n                  <\/button>/,
    newSuppressControl,
    "suppress action dropdown",
  );
} else {
  console.log("Suppress action dropdown already present.");
}

fs.writeFileSync(dashboardPath, source);

let css = fs.readFileSync(globalsPath, "utf8");
if (!css.includes(".suppression-control")) {
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
} else {
  console.log("Alert suppression dropdown CSS already present.");
}
