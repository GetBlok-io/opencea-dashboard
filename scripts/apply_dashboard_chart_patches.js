const fs = require("fs");
const path = require("path");

const dashboardPath = path.join(__dirname, "..", "components", "Dashboard.tsx");
let source = fs.readFileSync(dashboardPath, "utf8");

const marker = '  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure"';

if (!source.includes(marker)) {
  const search = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n];';
  const replacement = '  { aliasKey: "cultivation_tank_depth", title: "Cultivation Tank Depth", subtitle: "Tank depth", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_left_send_pressure", title: "Left Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n  { aliasKey: "cultivation_right_send_pressure", title: "Right Send Pressure", subtitle: "Cultivation feed pressure", unit: "%", zone: "Cultivation", kind: "percent" },\n];';

  if (!source.includes(search)) {
    throw new Error("Could not find cultivation tank depth chart block in Dashboard.tsx");
  }

  source = source.replace(search, replacement);
  fs.writeFileSync(dashboardPath, source);
  console.log("Applied dashboard chart patch for cultivation send pressure cards.");
} else {
  console.log("Dashboard chart patch already applied.");
}
