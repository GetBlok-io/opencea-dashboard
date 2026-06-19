# farmhand-dashboard

Next.js dashboard for Farmhand reported state telemetry.

The app reads the latest connected module snapshots from PostgreSQL table `reported_state`, enriches each mapped IO value with friendly names from `module_list`, and displays the farm by operational zone:

- Container
- Nursery
- Cultivation

## Current display behavior

- Disconnected modules are hidden.
- Values are grouped by `module_list.zone`.
- Card titles are zone names instead of raw hardware module types.
- Module IDs are not displayed in the dashboard UI.
- Temperatures are assumed to be Celsius at source and can be toggled to Fahrenheit.
- Output values render as `OFF` for `0` and `ON` for `1`.
- Nutrient / chemical level input values render as `OK` for `0` and `LOW` for `1`.

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
