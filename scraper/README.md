# OpenCEA Farmhand Local Scraper

This folder contains the command-line scraper/importer for Farmhand-local controller data.

It supports two workflows:

1. **Online mode**: run the script while your computer is on the same network as the Farmhand controller.
2. **Files mode**: import JSON files that were manually exported from Farmhand endpoints.

Online mode is the preferred operating path because it removes manual export steps and keeps OpenCEA ingestion repeatable. Files mode remains useful for debugging, historical imports, and offline testing.

## Farmhand local endpoints

The local Farmhand base URL is expected to be:

```txt
http://192.168.200.200:3001
```

The scraper reads these endpoints:

| Purpose | Endpoint |
|---|---|
| Main controller / group metadata | `/` |
| Last reported state | `/debug` |
| Cameras | `/cameras` |
| Modules | `/modules` |
| Programming | `/programming` |
| Settings | `/settings` |

Only `/debug` is inserted into `reported_state`. The other endpoint payloads are stored in `farm_config_snapshot` for audit/debugging and future Recipe/Control features.

## Install

From the repository root:

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
cd scraper
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Required environment

```bash
export DATABASE_URL="postgresql://user:password@host:5432/database"
export FARM_NAME="PeaPod-1"
export FARMHAND_CONTROLLER_ID="e5f03cd6-8d1c-11ed-897e-17d755fdf10c"
export FARMHAND_GROUP_ID="e7aaaf4e-28c2-4e3f-81be-1584b4386416"
```

`FARMHAND_CONTROLLER_ID` and `FARMHAND_GROUP_ID` can also be passed on the command line. The scraper attempts to discover them from `/`, but explicit values are recommended until the controller root payload is fully standardized.

## Database prerequisites

Apply these schemas/migrations before running the scraper:

```bash
psql "$DATABASE_URL" -f ../db/farm_config_schema.sql
psql "$DATABASE_URL" -f ../db/reported_state_farm_identity.sql
```

The scraper is backward-compatible with older `reported_state` tables that do not have `controller_id` and `group_id`, but multi-farm support requires those columns.

## Online mode

Run this while connected to the same network as the Farmhand controller:

```bash
python farmhand_local_scraper.py online
```

Equivalent explicit command:

```bash
python farmhand_local_scraper.py online \
  --base-url "http://192.168.200.200:3001" \
  --controller-id "e5f03cd6-8d1c-11ed-897e-17d755fdf10c" \
  --group-id "e7aaaf4e-28c2-4e3f-81be-1584b4386416" \
  --farm-name "PeaPod-1"
```

To only ingest `/debug` reported-state data and skip config snapshots:

```bash
python farmhand_local_scraper.py online --skip-config
```

## Files mode

Use this when you have manually exported JSON files:

```bash
python farmhand_local_scraper.py files \
  --controller-file ./exports/controller.json \
  --reported-state-file ./exports/reported_state.json \
  --cameras-file ./exports/current_cameras.json \
  --modules-file ./exports/current_modules.json \
  --programming-file ./exports/programming.json \
  --settings-file ./exports/settings.json \
  --controller-id "e5f03cd6-8d1c-11ed-897e-17d755fdf10c" \
  --group-id "e7aaaf4e-28c2-4e3f-81be-1584b4386416" \
  --farm-name "PeaPod-1"
```

`--reported-state-file` is required in files mode. Other files are optional.

## Suggested operating model

For one-off/manual syncs, run online mode directly from a laptop on the farm network.

For recurring production syncs, run this script from an OpenCEA gateway or farm-side machine that has:

- network access to `http://192.168.200.200:3001`
- outbound access to the OpenCEA PostgreSQL database
- a scheduled job, such as cron, systemd timer, or Task Scheduler

Example cron entry for every 5 minutes:

```cron
*/5 * * * * cd /opt/opencea-dashboard/scraper && . .venv/bin/activate && python farmhand_local_scraper.py online >> /var/log/opencea-farmhand-scraper.log 2>&1
```

## Notes

- This scraper is read-only against Farmhand-local endpoints.
- It does not issue command/control requests.
- For multi-farm support, always set a unique `FARMHAND_CONTROLLER_ID` per farm.
- Future command/control should use a separate audited command queue, not this data-ingestion script.
