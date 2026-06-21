const fs = require("fs");
const path = require("path");

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) {
    console.log(`${label} already applied.`);
    return source;
  }
  if (!source.includes(search)) {
    throw new Error(`Could not find pattern for ${label}.`);
  }
  console.log(`Applied ${label}.`);
  return source.replace(search, replacement);
}

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
let dashboard = fs.readFileSync(dashboardPath, "utf8");

dashboard = replaceOnce(
  dashboard,
  `type ApiResponse = {\n  ok: boolean;\n  count?: number;\n  generated_at?: string;\n  data?: ReportedStateRow[];\n  error?: string;\n};`,
  `type ApiResponse = {\n  ok: boolean;\n  count?: number;\n  generated_at?: string;\n  selected_farm?: { controllerId: string | null; groupId: string | null };\n  data?: ReportedStateRow[];\n  error?: string;\n};\n\ntype FarmOption = {\n  controller_id: string;\n  group_id: string | null;\n  farm_name: string;\n  config_type: string | null;\n  label: string;\n  value: string;\n};\n\ntype FarmListApiResponse = {\n  ok: boolean;\n  generated_at?: string;\n  count?: number;\n  farms?: FarmOption[];\n  error?: string;\n};`,
  "dashboard farm response types"
);

dashboard = replaceOnce(
  dashboard,
  `function RecipeFoundation({ temperatureUnit }: { temperatureUnit: TemperatureUnit }) {\n  return <RecipeDashboard temperatureUnit={temperatureUnit} />;\n}`,
  `function RecipeFoundation({ temperatureUnit, controllerId }: { temperatureUnit: TemperatureUnit; controllerId: string | null }) {\n  return <RecipeDashboard temperatureUnit={temperatureUnit} controllerId={controllerId} />;\n}`,
  "recipe farm prop"
);

dashboard = replaceOnce(
  dashboard,
  `export default function Dashboard({ initialRows }: { initialRows: ReportedStateRow[] }) {\n  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30");\n  const farmName = process.env.NEXT_PUBLIC_FARM_NAME ?? "PeaPod-1";\n  const [rows, setRows] = useState<ReportedStateRow[]>(initialRows);`,
  `export default function Dashboard({\n  initialRows,\n  farmOptions: initialFarmOptions,\n  selectedControllerId: initialSelectedControllerId,\n}: {\n  initialRows: ReportedStateRow[];\n  farmOptions?: FarmOption[];\n  selectedControllerId?: string | null;\n}) {\n  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30");\n  const [rows, setRows] = useState<ReportedStateRow[]>(initialRows);\n  const [farmOptions, setFarmOptions] = useState<FarmOption[]>(initialFarmOptions ?? []);\n  const [selectedControllerId, setSelectedControllerId] = useState<string | null>(initialSelectedControllerId ?? initialFarmOptions?.[0]?.controller_id ?? null);`,
  "dashboard farm props and state"
);

dashboard = replaceOnce(
  dashboard,
  `  async function refresh() {\n    setLoading(true);\n    setError(null);\n\n    try {\n      const [latestResponse, historyResponse] = await Promise.all([\n        fetch("/api/reported-state/latest", { cache: "no-store" }),\n        fetch("/api/reported-state/history?hours=24", { cache: "no-store" }),\n      ]);`,
  `  async function refresh(nextControllerId = selectedControllerId) {\n    setLoading(true);\n    setError(null);\n\n    try {\n      const farmQuery = nextControllerId ? \`controller_id=\${encodeURIComponent(nextControllerId)}\` : "";\n      const latestUrl = farmQuery ? \`/api/reported-state/latest?\${farmQuery}\` : "/api/reported-state/latest";\n      const historyUrl = farmQuery ? \`/api/reported-state/history?hours=24&\${farmQuery}\` : "/api/reported-state/history?hours=24";\n\n      const [latestResponse, historyResponse, farmsResponse] = await Promise.all([\n        fetch(latestUrl, { cache: "no-store" }),\n        fetch(historyUrl, { cache: "no-store" }),\n        fetch("/api/farm-list", { cache: "no-store" }),\n      ]);`,
  "dashboard farm-aware refresh URLs"
);

dashboard = replaceOnce(
  dashboard,
  `      const latestPayload = (await latestResponse.json()) as ApiResponse;\n      const historyPayload = (await historyResponse.json()) as HistoryApiResponse;`,
  `      const latestPayload = (await latestResponse.json()) as ApiResponse;\n      const historyPayload = (await historyResponse.json()) as HistoryApiResponse;\n      const farmsPayload = (await farmsResponse.json()) as FarmListApiResponse;`,
  "dashboard parse farms response"
);

dashboard = replaceOnce(
  dashboard,
  `      setRows(latestPayload.data);\n      setLastRefresh(latestPayload.generated_at ?? new Date().toISOString());`,
  `      setRows(latestPayload.data);\n      setLastRefresh(latestPayload.generated_at ?? new Date().toISOString());\n      setSelectedControllerId(latestPayload.selected_farm?.controllerId ?? nextControllerId ?? null);\n\n      if (farmsResponse.ok && farmsPayload.ok && farmsPayload.farms) {\n        setFarmOptions(farmsPayload.farms);\n      }`,
  "dashboard store selected farm and farm options"
);

dashboard = replaceOnce(
  dashboard,
  `  useEffect(() => {\n    refresh();\n    const interval = window.setInterval(refresh, refreshSeconds * 1000);\n    return () => window.clearInterval(interval);\n  }, [refreshSeconds]);`,
  `  useEffect(() => {\n    refresh(selectedControllerId);\n    const interval = window.setInterval(() => refresh(selectedControllerId), refreshSeconds * 1000);\n    return () => window.clearInterval(interval);\n  }, [refreshSeconds, selectedControllerId]);`,
  "dashboard refresh selected farm effect"
);

dashboard = replaceOnce(
  dashboard,
  `  const summary = useMemo(() => {`,
  `  const selectedFarm = useMemo(() => {\n    return farmOptions.find((farm) => farm.controller_id === selectedControllerId) ?? null;\n  }, [farmOptions, selectedControllerId]);\n\n  const farmName = selectedFarm?.farm_name ?? selectedControllerId ?? process.env.NEXT_PUBLIC_FARM_NAME ?? "OpenCEA Farm";\n\n  function handleFarmChange(nextControllerId: string) {\n    setSelectedControllerId(nextControllerId || null);\n    const nextUrl = nextControllerId ? \`/?farm=\${encodeURIComponent(nextControllerId)}\` : "/";\n    window.history.replaceState(null, "", nextUrl);\n    refresh(nextControllerId || null);\n  }\n\n  const summary = useMemo(() => {`,
  "dashboard selected farm helpers"
);

dashboard = replaceOnce(
  dashboard,
  `        <div className="hero-actions">\n          <div className="toggle-group" aria-label="Dashboard section">`,
  `        <div className="hero-actions">\n          <label className="farm-selector">\n            <span>Farm</span>\n            <select value={selectedControllerId ?? ""} onChange={(event) => handleFarmChange(event.target.value)}>\n              {farmOptions.length === 0 ? <option value="">No farms found</option> : null}\n              {farmOptions.map((farm) => (\n                <option value={farm.controller_id} key={farm.controller_id}>\n                  {farm.label || farm.controller_id}\n                </option>\n              ))}\n            </select>\n          </label>\n          <div className="toggle-group" aria-label="Dashboard section">`,
  "dashboard farm selector UI"
);

dashboard = replaceOnce(
  dashboard,
  `      {activeSection === "control" ? <ControlFoundation zoneGroups={zoneGroups} /> : null}\n      {activeSection === "recipe" ? <RecipeFoundation temperatureUnit={temperatureUnit} /> : null}`,
  `      {activeSection === "control" ? <ControlFoundation zoneGroups={zoneGroups} /> : null}\n      {activeSection === "recipe" ? <RecipeFoundation temperatureUnit={temperatureUnit} controllerId={selectedControllerId} /> : null}`,
  "dashboard recipe selected farm render"
);

fs.writeFileSync(dashboardPath, dashboard);

const recipePath = path.join(__dirname, "..", "components", "RecipeDashboard.tsx");
let recipe = fs.readFileSync(recipePath, "utf8");

recipe = replaceOnce(
  recipe,
  `export default function RecipeDashboard({ temperatureUnit = "C" }: { temperatureUnit?: TemperatureUnit }) {`,
  `export default function RecipeDashboard({ temperatureUnit = "C", controllerId = null }: { temperatureUnit?: TemperatureUnit; controllerId?: string | null }) {`,
  "recipe dashboard controller prop"
);

recipe = replaceOnce(
  recipe,
  `        const response = await fetch("/api/recipe/current", { cache: "no-store" });`,
  `        const farmQuery = controllerId ? \`?controller_id=\${encodeURIComponent(controllerId)}\` : "";\n        const response = await fetch(\`/api/recipe/current\${farmQuery}\`, { cache: "no-store" });`,
  "recipe dashboard selected farm fetch"
);

recipe = replaceOnce(
  recipe,
  `  }, []);`,
  `  }, [controllerId]);`,
  "recipe dashboard controller effect dependency"
);

fs.writeFileSync(recipePath, recipe);
