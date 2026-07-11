ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_alert_rules_deleted_at
  ON alert_rules (deleted_at);
