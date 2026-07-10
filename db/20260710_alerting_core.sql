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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled
  ON alert_rules (enabled);

CREATE INDEX IF NOT EXISTS idx_alert_rules_farm_controller_id
  ON alert_rules (farm_controller_id);

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
  latest_value JSONB NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_status
  ON alert_events (alert_rule_id, status);

CREATE INDEX IF NOT EXISTS idx_alert_events_farm_status
  ON alert_events (farm_controller_id, status);

CREATE TABLE IF NOT EXISTS alert_notifications (
  id BIGSERIAL PRIMARY KEY,
  alert_event_id BIGINT NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'sms', 'webhook', 'noop')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NULL,
  next_attempt_at TIMESTAMPTZ NULL,
  provider_message_id TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_status
  ON alert_notifications (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_one_open_per_rule
  ON alert_events (alert_rule_id)
  WHERE status IN ('pending', 'active');
