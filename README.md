# Reported State Dashboard

A small Next.js dashboard for viewing the latest device telemetry from the PostgreSQL `reported_state` table.

## What it does

- Reads the latest row per `device_id` from PostgreSQL.
- Displays connected/disconnected status.
- Displays common telemetry values such as pH, EC, temperature, RH, CO2, analog values, pumps, and outputs.
- Includes a JSON details view for each device.
- Auto-refreshes through `/api/reported-state/latest`.

## Requirements

- Node.js 20+
- PostgreSQL database with the `reported_state` table already created
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

## Railway deployment

1. Push this folder to a GitHub repository.
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
