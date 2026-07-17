ALTER TABLE alert_events
  ADD COLUMN IF NOT EXISTS suppressed_until TIMESTAMPTZ NULL;

DROP INDEX IF EXISTS idx_alert_events_one_open_per_rule;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_one_open_per_rule
  ON alert_events (alert_rule_id)
  WHERE status IN ('pending', 'active', 'suppressed');

CREATE INDEX IF NOT EXISTS idx_alert_events_suppressed_until
  ON alert_events (suppressed_until);
