import { pool } from "@/lib/db";
import type { AlertRule } from "./types";

type EmailRecipientChannel = {
  recipient_id: string;
  recipient_name: string;
  channel_id: string;
  destination: string;
};

type AlertNotificationSendResult = {
  channelId: string;
  destination: string;
  action: "sent" | "failed" | "skipped";
  notificationId?: string;
  providerMessageId?: string | null;
  error?: string;
};

const PRIORITY_WEIGHTS: Record<AlertRule["priority"], number> = {
  info: 25,
  warning: 50,
  critical: 75,
  emergency: 100,
};

function priorityWeight(priority: string) {
  return PRIORITY_WEIGHTS[priority as AlertRule["priority"]] ?? 0;
}

function isEmailNotificationsConfigured() {
  return Boolean(
    process.env.CLICKSEND_USERNAME &&
      process.env.CLICKSEND_API_KEY &&
      process.env.CLICKSEND_EMAIL_FROM_ADDRESS_ID,
  );
}

function clickSendAuthHeader() {
  const username = process.env.CLICKSEND_USERNAME ?? "";
  const apiKey = process.env.CLICKSEND_API_KEY ?? "";
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
}

function appUrl() {
  return process.env.ALERT_DASHBOARD_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
}

function buildAlertEmail(rule: AlertRule, eventId: string) {
  const dashboardUrl = appUrl();
  const subject = `[OpenCEA ${rule.priority.toUpperCase()}] ${rule.name}`;
  const lines = [
    `<p><strong>${escapeHtml(rule.name)}</strong></p>`,
    `<p>Priority: <strong>${escapeHtml(rule.priority)}</strong></p>`,
    `<p>Metric: <strong>${escapeHtml(rule.metric_key)}</strong></p>`,
    `<p>Alert event: #${escapeHtml(eventId)}</p>`,
  ];

  if (rule.description) {
    lines.push(`<p>${escapeHtml(rule.description)}</p>`);
  }

  if (dashboardUrl) {
    lines.push(`<p><a href="${escapeHtml(dashboardUrl)}">Open OpenCEA Dashboard</a></p>`);
  }

  lines.push("<p>This notification was generated when the alert became active.</p>");

  return {
    subject,
    body: lines.join("\n"),
  };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadEmailRecipientChannels(rule: AlertRule): Promise<EmailRecipientChannel[]> {
  const result = await pool.query(
    `
      SELECT
        rec.id::text AS recipient_id,
        rec.name AS recipient_name,
        arc.id::text AS channel_id,
        arc.destination
      FROM alert_rule_recipients arr
      JOIN alert_recipients rec
        ON rec.id = arr.alert_recipient_id
      JOIN alert_recipient_channels arc
        ON arc.alert_recipient_id = rec.id
      WHERE arr.alert_rule_id = $1
        AND arr.enabled = true
        AND rec.enabled = true
        AND arc.enabled = true
        AND arc.channel_type = 'email'
        AND CASE arc.priority_minimum
          WHEN 'emergency' THEN 100
          WHEN 'critical' THEN 75
          WHEN 'warning' THEN 50
          WHEN 'info' THEN 25
          ELSE 0
        END <= $2
      ORDER BY rec.name ASC, arc.destination ASC;
    `,
    [rule.id, priorityWeight(rule.priority)],
  );

  return result.rows;
}

async function reserveNotification(
  eventId: string,
  rule: AlertRule,
  channel: EmailRecipientChannel,
  subject: string,
  body: string,
) {
  const result = await pool.query(
    `
      INSERT INTO alert_notifications (
        alert_event_id,
        alert_recipient_id,
        alert_recipient_channel_id,
        channel_type,
        provider,
        destination,
        subject,
        body,
        status
      )
      VALUES ($1, $2, $3, 'email', 'clicksend', $4, $5, $6, 'pending')
      ON CONFLICT (alert_event_id, alert_recipient_channel_id, channel_type)
        WHERE alert_recipient_channel_id IS NOT NULL
      DO NOTHING
      RETURNING id::text;
    `,
    [
      eventId,
      channel.recipient_id,
      channel.channel_id,
      channel.destination,
      subject,
      body,
    ],
  );

  return result.rows[0]?.id as string | undefined;
}

async function markNotificationSent(notificationId: string, providerMessageId: string | null, response: unknown) {
  await pool.query(
    `
      UPDATE alert_notifications
      SET
        status = 'sent',
        attempt_count = attempt_count + 1,
        last_attempt_at = NOW(),
        provider_message_id = $2,
        response_json = $3::jsonb,
        error_message = NULL,
        updated_at = NOW()
      WHERE id = $1;
    `,
    [notificationId, providerMessageId, JSON.stringify(response ?? null)],
  );
}

async function markNotificationFailed(notificationId: string, errorMessage: string, response: unknown = null) {
  await pool.query(
    `
      UPDATE alert_notifications
      SET
        status = 'failed',
        attempt_count = attempt_count + 1,
        last_attempt_at = NOW(),
        error_message = $2,
        response_json = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1;
    `,
    [notificationId, errorMessage, JSON.stringify(response ?? null)],
  );
}

async function sendClickSendEmail(channel: EmailRecipientChannel, subject: string, body: string) {
  const fromAddressId = Number(process.env.CLICKSEND_EMAIL_FROM_ADDRESS_ID);
  if (!Number.isFinite(fromAddressId) || fromAddressId <= 0) {
    throw new Error("CLICKSEND_EMAIL_FROM_ADDRESS_ID must be a positive number.");
  }

  const response = await fetch("https://rest.clicksend.com/v3/email/send", {
    method: "POST",
    headers: {
      Authorization: clickSendAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [
        {
          email: channel.destination,
          name: channel.recipient_name,
        },
      ],
      from: {
        email_address_id: fromAddressId,
        name: process.env.CLICKSEND_EMAIL_FROM_NAME ?? "OpenCEA Alerts",
      },
      subject,
      body,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.response_code !== "SUCCESS") {
    throw new Error(payload?.response_msg ?? `ClickSend email request failed with HTTP ${response.status}.`);
  }

  return {
    payload,
    messageId: payload?.data?.message_id ? String(payload.data.message_id) : null,
  };
}

export async function sendAlertNotificationsForEvent(eventId: string | number | undefined, rule: AlertRule) {
  if (!eventId) {
    return [] satisfies AlertNotificationSendResult[];
  }

  const eventIdText = String(eventId);
  const channels = await loadEmailRecipientChannels(rule);
  const { subject, body } = buildAlertEmail(rule, eventIdText);
  const results: AlertNotificationSendResult[] = [];

  if (channels.length === 0) {
    return results;
  }

  if (!isEmailNotificationsConfigured()) {
    return channels.map((channel) => ({
      channelId: channel.channel_id,
      destination: channel.destination,
      action: "skipped",
      error: "ClickSend email credentials are not configured.",
    }));
  }

  for (const channel of channels) {
    const notificationId = await reserveNotification(eventIdText, rule, channel, subject, body);

    if (!notificationId) {
      results.push({
        channelId: channel.channel_id,
        destination: channel.destination,
        action: "skipped",
        error: "Notification already exists for this alert event and channel.",
      });
      continue;
    }

    try {
      const sendResult = await sendClickSendEmail(channel, subject, body);
      await markNotificationSent(notificationId, sendResult.messageId, sendResult.payload);
      results.push({
        channelId: channel.channel_id,
        destination: channel.destination,
        action: "sent",
        notificationId,
        providerMessageId: sendResult.messageId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown ClickSend email error";
      await markNotificationFailed(notificationId, errorMessage);
      results.push({
        channelId: channel.channel_id,
        destination: channel.destination,
        action: "failed",
        notificationId,
        error: errorMessage,
      });
    }
  }

  return results;
}
