# OpenCEA Dashboard

OpenCEA Dashboard is an open-source visibility dashboard for CEA container farms. This build is designed around Freight Farms-style controller exports while keeping the project name and codebase brand-neutral.

## Current scope

- Monitoring dashboard backed by `reported_state` and `module_list`
- Farm selector backed by stable controller/group identifiers
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
```

## Farm registry and reported-state identity

For multi-farm support, telemetry rows should carry stable farm identity columns:

- `reported_state.controller_id`
- `reported_state.group_id`

Apply the reported-state identity migration:

```bash
psql "$DATABASE_URL" -f db/reported_state_farm_identity.sql
```

The dashboard query layer will use these indexed columns when they exist. If the migration has not been applied yet, it falls back to the legacy `source_url` / `raw_record` text-matching bridge so existing deployments can continue to render while the scraper is updated.

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

The dashboard expects:

- `reported_state`
- `module_list`

The farm selector expects `farm_registry` from `db/farm_config_schema.sql`. Reported-state farm identity columns are recommended for multi-farm performance and clean tenancy filtering.

The historical chart cards use the existing `reported_state` table and will become more useful as repeated scraper snapshots accumulate.

## Monitoring layout update

The Monitoring section is organized by operational zone:

- Container
- Nursery
- Cultivation

Each zone panel consolidates trend charts and current mapped status values in one place. Charted metrics such as temperature, humidity, CO2, pH, EC, and tank depth are not duplicated as standalone value cards. Output and pump states are rendered as read-only ON/OFF switch indicators until explicit control execution is designed.
