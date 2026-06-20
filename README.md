# OpenCEA Dashboard

OpenCEA Dashboard is an open-source visibility dashboard for CEA container farms. This build is designed around Freight Farms-style controller exports while keeping the project name and codebase brand-neutral.

## Current scope

- Monitoring dashboard backed by `reported_state` and `module_list`
- Zone grouping for Container, Nursery, and Cultivation
- Celsius/Fahrenheit temperature toggle
- Visual trend cards for temperature, humidity, CO2, pH, EC, and tank depth using Recharts
- Read-only Control and Recipe foundation views
- Optional farm configuration snapshot schema/importer for controller configuration files

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Required environment variables

```env
DATABASE_URL=postgresql://user:password@host:5432/database
NEXT_PUBLIC_REFRESH_SECONDS=30
NEXT_PUBLIC_FARM_NAME=PeaPod-1
```

## Optional farm configuration registry

The sample controller files can be placed in `/data` and imported into PostgreSQL for future Control and Recipe expansion.

Create the tables:

```bash
psql "$DATABASE_URL" -f db/farm_config_schema.sql
```

Install Python importer dependency:

```bash
pip install -r scripts/requirements.txt
```

Import config snapshots:

```bash
export CONTROLLER_ID="e5f03cd6-8d1c-11ed-897e-17d755fdf10c"
export GROUP_ID="e7aaaf4e-28c2-4e3f-81be-1584b4386416"
export FARM_NAME="PeaPod-1"
python scripts/import_farm_config.py
```

## Existing database dependencies

The dashboard still expects:

- `reported_state`
- `module_list`

The historical chart cards use the existing `reported_state` table and will become more useful as repeated scraper snapshots accumulate.
