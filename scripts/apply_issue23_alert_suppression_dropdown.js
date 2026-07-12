const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
const globalsPath = path.join(__dirname, "..", "app", "globals.css");
let source = fs.readFileSync(dashboardPath, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) {
    console.log(`${label} already present or pattern not found.`);
    return false;
  }
  source = source.replace(search, replacement);
  console.log(`Patched ${label}.`);
  return true;
}

const optionMarker = "const ALERT_SUPPRESSION_OPTIONS = [";
if (!source.includes(optionMarker)) {
  replaceOnce(
    'const ALERT_PRIORITIES = ["info", "warning", "critical", "emergency"] as const;\n',
    'const ALERT_PRIORITIES = ["info", "warning", "critical", "emergency"] as const;\n\nconst ALERT_SUPPRESSION_OPTIONS = [\n  { label: "1 hour", minutes: 60 },\n  { label: "12 hours", minutes: 720 },\n  { label: "24 hours", minutes: 1440 },\n] as const;\n',
    "alert suppression options",
  );
} else {
  console.log("Alert suppression options already present.");
}

const stateMarker = "const [suppressDurationByEventId, setSuppressDurationByEventId]";
if (!source.includes(stateMarker)) {
  replaceOnce(
    '  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);\n  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;\n',
    '  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);\n  const [suppressDurationByEventId, setSuppressDurationByEventId] = useState<Record<string, number>>({});\n  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;\n\n  function selectedSuppressionMinutes(eventId: string) {\n    return suppressDurationByEventId[eventId] ?? ALERT_SUPPRESSION_OPTIONS[0].minutes;\n  }\n',
    "alert suppression duration state",
  );
} else {
  console.log("Alert suppression duration state already present.");
}

const oldSuppressFunction = `  async function suppressAlertEvent(event: AlertEventRow) {
    const answer = window.prompt(
      "Suppress this alert for how long?\\n\\nEnter one of: 1h, 12h, 24h\\nOr enter minutes, such as 60.",
      "1h",
    );

    if (!answer) {
      return;
    }

    const normalized = answer.trim().toLowerCase();
    const suppressMinutesByLabel: Record<string, number> = {
      "1h": 60,
      "1hr": 60,
      "1 hour": 60,
      "12h": 720,
      "12hr": 720,
      "12 hours": 720,
      "24h": 1440,
      "24hr": 1440,
      "24 hours": 1440,
    };

    const suppressMinutes = suppressMinutesByLabel[normalized] ?? Number(normalized);

    if (!Number.isInteger(suppressMinutes) || suppressMinutes <= 0) {
      window.alert("Enter a valid suppression duration, such as 1h, 12h, 24h, or 60.");
      return;
    }

    await updateAlertEvent(event, "suppress", suppressMinutes);
  }
`;

const newSuppressFunction = `  async function suppressAlertEvent(event: AlertEventRow) {
    await updateAlertEvent(event, "suppress", selectedSuppressionMinutes(event.id));
  }
`;

if (source.includes(oldSuppressFunction)) {
  source = source.replace(oldSuppressFunction, newSuppressFunction);
  console.log("Patched prompt suppression handler.");
} else if (source.includes('selectedSuppressionMinutes(event.id)')) {
  console.log("Prompt suppression handler already replaced.");
} else {
  console.log("Prompt suppression handler pattern not found; leaving unchanged.");
}

const oldSuppressButton = `                  <button
                    type="button"
                    className="icon-button suppress-icon-button"
                    onClick={() => void suppressAlertEvent(event)}
                    title="Suppress alert"
                    aria-label={\`Suppress ${event.rule_name}\`}
                  >
                    ⏸
                  </button>`;

const newSuppressButton = `                  <span className="suppression-control">
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
                      aria-label={\`Suppression duration for ${event.rule_name}\`}
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
                      title={\`Suppress alert for ${selectedSuppressionMinutes(event.id) / 60} hour${selectedSuppressionMinutes(event.id) === 60 ? "" : "s"}\`}
                      aria-label={\`Suppress ${event.rule_name}\`}
                    >
                      ⏸
                    </button>
                  </span>`;

if (source.includes(oldSuppressButton)) {
  source = source.replace(oldSuppressButton, newSuppressButton);
  console.log("Patched suppress action dropdown.");
} else if (source.includes('className="suppression-control"')) {
  console.log("Suppress action dropdown already present.");
} else {
  console.log("Suppress action button pattern not found; leaving unchanged.");
}

fs.writeFileSync(dashboardPath, source);

let css = fs.readFileSync(globalsPath, "utf8");
const cssMarker = ".suppression-control";
if (!css.includes(cssMarker)) {
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
