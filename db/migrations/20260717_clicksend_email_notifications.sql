-- Add recipient/channel/provider tracking for outbound alert notifications.

ALTER TABLE alert_notifications
  ADD COLUMN IF NOT EXISTS alert_recipient_id BIGINT NULL REFERENCES alert_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_recipient_channel_id BIGINT NULL REFERENCES alert_recipient_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT NULL,
  ADD COLUMN IF NOT EXISTS destination TEXT NULL