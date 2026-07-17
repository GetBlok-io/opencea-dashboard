-- Add recipient/channel/provider tracking for outbound alert notifications.

ALTER TABLE alert_notifications
  ADD COLUMN IF NOT EXISTS alert_recipient_id BIGINT NULL REFERENCES alert_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_recipient_channel_id BIGINT NULL REFERENCES alert_recipient_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS destination TEXT NULL,
  ADD COLUMN IF NOT EXISTS subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS body TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_json JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_alert_notifications_event_channel
  ON alert_notifications (alert_event_id, channel_type);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_recipient
  ON alert_notifications (alert_recipient_id);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_recipient_channel
  ON alert_notifications (alert_recipient_channel_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_notifications_one_per_event_channel
  ON alert_notifications (alert_event_id, alert_recipient_channel_id, channel_type)
  WHERE alert_recipient_channel_id IS NOT NULL;
