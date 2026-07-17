-- OpenCEA Dashboard baseline schema extension file.
-- This file should include app-managed tables needed for a new deployment.
-- Existing Farmhand import tables may already be created by scraper/import setup.

CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGSERIAL PRIMARY KEY,
  farm_controller_id UUID NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL CHECK (source_type IN ('monitoring', 'control', 'recipe')),
  metric_key TEXT NOT NULL,
  condition_json JSONB NOT NULL,
  soak_seconds INTEGER NOT NULL DEFAULT 0 CHECK (soak_seconds >= 0),
  notification_delay_seconds INTEGER NOT NULL DEFAULT 0 CHECK (notification_delay_seconds >= 0),
  cooldown_seconds INTEGER NOT NULL DEFAULT 1800 CHECK (cooldown_seconds >= 0),
  priority TEXT NOT NULL DEFAULT 'warning' CHECK (priority IN ('info', 'warning', 'critical', 'emergency')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled
  ON alert_rules (enabled);

CREATE INDEX IF NOT EXISTS idx_alert_rules_farm_controller_id
  ON alert_rules (farm_controller_id);

CREATE INDEX IF NOT EXISTS idx_alert_rules_deleted_at
  ON alert_rules (deleted_at);

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  alert_rule_id BIGINT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  farm_controller_id UUID NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'resolved', 'suppressed')),
  first_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  suppressed_until TIMESTAMPTZ NULL,
  latest_value JSONB NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_status
  ON alert_events (alert_rule_id, status);

CREATE INDEX IF NOT EXISTS idx_alert_events_farm_status
  ON alert_events (farm_controller_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_one_open_per_rule
  ON alert_events (alert_rule_id)
  WHERE status IN ('pending', 'active', 'suppressed');

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

CREATE TABLE IF NOT EXISTS alert_notifications (
  id BIGSERIAL PRIMARY KEY,
  alert_event_id BIGINT NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  alert_recipient_id BIGINT NULL REFERENCES alert_recipients(id) ON DELETE SET NULL,
  alert_recipient_channel_id BIGINT NULL REFERENCES alert_recipient_channels(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'sms', 'webhook', 'noop')),
  provider TEXT NULL,
  destination TEXT NULL,
  subject TEXT NULL,
  body TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NULL,
  next_attempt_at TIMESTAMPTZ NULL,
  provider_message_id TEXT NULL,
  error_message TEXT NULL,
  response_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_status
  ON alert_notifications (status);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_event_channel
  ON alert_notifications (alert_event_id, channel_type);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_recipient
  ON alert_notifications (alert_recipient_id);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_recipient_channel
  ON alert_notifications (alert_recipient_channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_notifications_one_per_event_channel
  ON alert_notifications (alert_event_id, alert_recipient_channel_id, channel_type)
  WHERE alert_recipient_channel_id IS NOT NULL;
