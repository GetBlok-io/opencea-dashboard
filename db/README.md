# Database schema management

This project keeps two database paths:

## Existing database upgrades

Run files in `db/migrations/` in filename order.

Example:

```bash
psql "$DATABASE_URL" -f db/migrations/20260710_alert_recipients.sql
