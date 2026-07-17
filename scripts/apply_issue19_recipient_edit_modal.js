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

function ensureImport() {
  if (source.includes('import AlertRecipientEditModal from "./AlertRecipientEditModal";')) {
    console.log("Recipient edit modal import already present.");
    return;
  }

  const patched = patchRegex(
    /import RecipeDashboard from "\.\/RecipeDashboard";\r?\n/,
    'import RecipeDashboard from "./RecipeDashboard";\nimport AlertRecipientEditModal from "./AlertRecipientEditModal";\n',
    "recipient edit modal import",
  );

  if (!patched) {
    throw new Error("Could not add AlertRecipientEditModal import.");
  }
}

function ensureState() {
  if (source.includes("const [editingRecipientId, setEditingRecipientId]")) {
    console.log("Recipient edit state already present.");
    return;
  }

  const patched = patchRegex(
    /(  const \[editingRuleId, setEditingRuleId\] = useState<string \| null>\(null\);\r?\n)/,
    '$1  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);\n',
    "recipient edit state",
  );

  if (!patched) {
    throw new Error("Could not add recipient edit state.");
  }
}

function ensureRecipientButtons() {
  if (source.includes('className="recipient-link-button"')) {
    console.log("Recipient link buttons already present.");
    return;
  }

  const replacement = `                <span className="recipient-link-list">
                  {rule.recipients?.length ? rule.recipients.map((recipient) => (
                    <button
                      type="button"
                      className="recipient-link-button"
                      key={recipient.id}
                      onClick={() => setEditingRecipientId(recipient.id)}
                      title={\`Edit recipient \${recipient.name}\`}
                    >
                      {recipient.name}
                    </button>
                  )) : "No recipients"}
                </span>`;

  const patched = patchRegex(
    /                <span>\{rule\.recipients\?\.length \? rule\.recipients\.map\(\(recipient\) => recipient\.name\)\.join\(", "\) : "No recipients"\}<\/span>/,
    replacement,
    "recipient link buttons",
  );

  if (!patched) {
    throw new Error("Could not replace recipient text with clickable buttons.");
  }
}

function ensureModal() {
  if (source.includes("<AlertRecipientEditModal")) {
    console.log("Recipient edit modal already present.");
    return;
  }

  const modalBlock = `

      {editingRecipientId ? (
        <AlertRecipientEditModal
          recipientId={editingRecipientId}
          onSaved={() => {
            setEditingRecipientId(null);
            void onRefresh();
          }}
          onCancel={() => setEditingRecipientId(null)}
        />
      ) : null}`;

  const patched = patchRegex(
    /(      \{editingRule \? \([\s\S]*?      \) : null\}\r?\n)(    <\/section>)/,
    `$1${modalBlock}\n$2`,
    "recipient edit modal render",
  );

  if (!patched) {
    throw new Error("Could not add recipient edit modal render.");
  }
}

function ensureCss() {
  let css = fs.readFileSync(globalsPath, "utf8");
  if (css.includes(".recipient-link-button")) {
    console.log("Recipient edit modal CSS already present.");
    return;
  }

  css += `

.recipient-link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.recipient-link-button {
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
}

.recipient-link-button:hover,
.recipient-link-button:focus-visible {
  border-color: rgba(96, 165, 250, 0.75);
  background: rgba(37, 99, 235, 0.22);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.72);
  padding: 1rem;
}

.modal-card {
  width: min(58rem, 100%);
  max-height: 90vh;
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.98);
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.45);
  padding: 1.25rem;
}

.modal-header,
.recipient-channel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.recipient-edit-form {
  display: grid;
  gap: 1rem;
}

.recipient-channel-list {
  display: grid;
  gap: 1rem;
}

.recipient-channel-card {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.45);
  padding: 1rem;
}

.modal-actions {
  justify-content: flex-start;
}

.danger-button {
  border-color: rgba(248, 113, 113, 0.4);
  color: rgb(252, 165, 165);
}
`;

  fs.writeFileSync(globalsPath, css);
  console.log("Patched recipient edit modal CSS.");
}

ensureImport();
ensureState();
ensureRecipientButtons();
ensureModal();

const requiredMarkers = [
  'import AlertRecipientEditModal from "./AlertRecipientEditModal";',
  "const [editingRecipientId, setEditingRecipientId]",
  'className="recipient-link-button"',
  "<AlertRecipientEditModal",
];

const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
if (missingMarkers.length > 0) {
  throw new Error(`Issue #19 repair incomplete. Missing: ${missingMarkers.join(", ")}`);
}

fs.writeFileSync(dashboardPath, source);
ensureCss();
