# opencea-dashboard

Next.js dashboard for reported state telemetry from CEA container farms, designed around Freight Farms container deployments while remaining open-source and brand-neutral in naming.

The app reads the latest connected module snapshots from PostgreSQL table `reported_state`, enriches each mapped IO value with friendly names from `module_list`, and displays the farm by operational zone:

- Container
- Nursery
- Cultivation

## Current display behavior

- Disconnected modules are hidden.
- Values are grouped by `module_list.zone`.
- Card titles are zone names instead of raw hardware module types.
- Module IDs and IO keys are temporarily displayed under each metric for troubleshooting mapping issues.
- Temperatures are assumed to be Celsius at source and can be toggled to Fahrenheit.
- Output and pump values render as `OFF` for `0` and `ON` for `1`.
- Trough level values render as `FULL` for `0` and `EMPTY` for `1`.
- Container nutrient tank level values render as `OK` for `0` and `LOW` for `1`. Nursery and Cultivation nutrient/pH entries mapped to `pump_*` keys are treated as dosing pumps and render as `OFF` / `ON`, not tank levels.
- Tank depth and left/right send pressure values render as percentages.
- Container rows are organized as climate, nutrient tank levels, then other controls.
- Nursery and Cultivation rows are organized as water chemistry, water levels, then pumps/lights/controls.

## Environment variables

Create a `.env` file locally:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
NEXT_PUBLIC_REFRESH_SECONDS=30
```

For Railway, add the same variables in the service Variables tab.

## Local development

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Database requirement

This dashboard expects both tables to exist:

```sql
reported_state
module_list
```

The `module_list` table should be populated by the scraper/import process before deploying this dashboard. If the mapping is missing, the dashboard will have no mapped values to show under the three zone groupings.

## Railway

Build command:

```bash
npm run build
```

Start command:

```bash
npm start
```
