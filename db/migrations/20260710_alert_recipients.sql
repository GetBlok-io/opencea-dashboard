CREATE TABLE IF NOT EXISTS alert_recipients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'person'
    CHECK (recipient_type IN ('person', 'role', 'group')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_recipients_enabled
  ON alert_recipients (enabled);

CREATE TABLE IF NOT EXISTS alert_recipient_channels (
  id BIGSERIAL PRIMARY KEY,
  alert_recipient_id BIGINT NOT NULL REFERENCES alert_recipients(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'sms')),
  destination TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority_minimum TEXT NOT NULL DEFAULT 'info'
    CHECK (priority_minimum IN ('info', 'warning', 'critical', 'emergency')),
  quiet_hours_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_recipient_channels_recipient
  ON alert_recipient_channels (alert_recipient_id);

CREATE INDEX IF NOT EXISTS idx_alert_recipient_channels_enabled
  ON alert_recipient_channels (enabled);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_recipient_channels_unique_destination
  ON alert_recipient_channels (alert_recipient_id, channel_type, destination);

CREATE TABLE IF NOT EXISTS alert_rule_recipients (
  id BIGSERIAL PRIMARY KEY,
  alert_rule_id BIGINT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  alert_recipient_id BIGINT NOT NULL REFERENCES alert_recipients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alert_rule_id, alert_recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_rule_recipients_rule
  ON alert_rule_recipients (alert_rule_id);

CREATE INDEX IF NOT EXISTS idx_alert_rule_recipients_recipient
  ON alert_rule_recipients (alert_recipient_id);

CREATE INDEX IF NOT EXISTS idx_alert_rule_recipients_enabled
  ON alert_rule_recipients (enabled);
