const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
let source = fs.readFileSync(dashboardPath, "utf8");

const sendPressureMarker = '  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure"';
if (!source.includes(sendPressureMarker)) {
  const search = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n];';
  const replacement = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_right_send_pressure", title: "Right Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n];';
  if (!source.includes(search)) {
    throw new Error("Could not find cultivation tank depth chart block in Dashboard.tsx");
  }
  source = source.replace(search, replacement);
  console.log("Restored cultivation send pressure chart cards.");
} else {
  console.log("Cultivation send pressure chart cards already present.");
}

const buildZoneStrict = '  const connectedRows = rows.filter((row) => row.connected === true);\n\n  for (const row of connectedRows) {';
const buildZoneFallback = '  const explicitlyConnectedRows = rows.filter((row) => row.connected === true);\n  const displayRows = explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;\n\n  for (const row of displayRows) {';
if (source.includes(buildZoneStrict)) {
  source = source.replace(buildZoneStrict, buildZoneFallback);
  console.log("Patched buildZoneGroups connected fallback.");
} else if (source.includes("const displayRows = explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;")) {
  console.log("buildZoneGroups connected fallback already present.");
} else {
  console.log("buildZoneGroups connected fallback pattern not found; leaving unchanged.");
}

const dashboardStrict = '  const connectedRows = useMemo(() => rows.filter((row) => row.connected === true), [rows]);';
const dashboardFallback = `  const connectedRows = useMemo(() => {
    const explicitlyConnectedRows = rows.filter((row) => row.connected === true);
    return explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;
  }, [rows]);`;
if (source.includes(dashboardStrict)) {
  source = source.replace(dashboardStrict, dashboardFallback);
  console.log("Patched dashboard connected rows fallback.");
} else if (source.includes("return explicitlyConnectedRows.length > 0 ? explicitlyConnectedRows : rows;")) {
  console.log("Dashboard connected rows fallback already present.");
} else {
  console.log("Dashboard connected rows fallback pattern not found; leaving unchanged.");
}

fs.writeFileSync(dashboardPath, source);
