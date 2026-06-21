-- Adds first-class farm identity columns to telemetry snapshots.
-- Apply before moving scraper ingestion to farm-aware inserts.
-- Existing rows can be backfilled from a known controller/group pair or left NULL
-- until the scraper starts writing identity values.

ALTER TABLE reported_state
  ADD COLUMN IF NOT EXISTS controller_id UUID,
  ADD COLUMN IF NOT EXISTS group_id UUID;

CREATE INDEX IF NOT EXISTS idx_reported_state_controller_scraped_at
  ON reported_state (controller_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_reported_state_group_controller_scraped_at
  ON reported_state (group_id, controller_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_reported_state_controller_device_scraped_at
  ON reported_state (controller_id, device_id, scraped_at DESC);

-- Optional one-time backfill for a single-farm deployment.
-- Replace the IDs before running, or keep this commented out for multi-farm databases.
--
-- UPDATE reported_state
-- SET
--   controller_id = 'e5f03cd6-8d1c-11ed-897e-17d755fdf10c'::uuid,
--   group_id = 'e7aaaf4e-28c2-4e3f-81be-1584b4386416'::uuid
-- WHERE controller_id IS NULL;
