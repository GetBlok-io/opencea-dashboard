# Farmhand Dashboard

A small Next.js dashboard for viewing the latest farm device telemetry from the PostgreSQL `reported_state` table.

## What it does

- Reads the latest row per `device_id` from PostgreSQL.
- Displays connected/disconnected status.
- Displays common telemetry values such as pH, EC, temperature, RH, CO2, analog values, pumps, and outputs.
- Enriches device telemetry with friendly labels from the `module_list` table.
- Provides a Celsius/Fahrenheit toggle. Source temperature values are assumed to be Celsius.
- Includes a JSON details view for each device.
- Auto-refreshes through `/api/reported-state/latest`.

## Requirements

- Node.js 20+
- PostgreSQL database with the `reported_state` table already created
- PostgreSQL database with the `module_list` table created from `db/module_list_schema.sql`
- `DATABASE_URL` environment variable

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then open:

```txt
http://localhost:3000
```

## Environment variables

```env
DATABASE_URL=postgresql://user:password@host:5432/database
NEXT_PUBLIC_REFRESH_SECONDS=30
```

Optional if your database requires SSL:

```env
PGSSLMODE=require
```

## Create the module_list table

Run this SQL against the same database used by the dashboard:

```bash
psql "$DATABASE_URL" -f db/module_list_schema.sql
```

Or paste the contents of `db/module_list_schema.sql` into your PostgreSQL query console.

## Import module mappings

Install the importer requirement in your Python virtual environment:

```bash
pip install -r scripts/requirements.txt
```

Set your local database URL:

```bash
export DATABASE_URL="postgresql://user:password@host:5432/database"
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://user:password@host:5432/database"
```

Then import your module mapping file:

```bash
python scripts/import_module_list.py /path/to/module_list.json
```

The importer supports both clean JSON and copied page text that contains the current module mapping JSON.

## Railway deployment

1. Push this folder to your GitHub repository named `farmhand-dashboard`.
2. In Railway, create a new project from the GitHub repo.
3. Add or attach PostgreSQL.
4. Set `DATABASE_URL` to the same database used by your ingest script.
5. Optional: set `NEXT_PUBLIC_REFRESH_SECONDS=30`.
6. Deploy.

Railway should detect this as a Next.js app and run the standard build/start flow.

## Useful endpoint

```txt
/api/reported-state/latest
```

Returns JSON:

```json
{
  "ok": true,
  "count": 8,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "data": []
}
```
