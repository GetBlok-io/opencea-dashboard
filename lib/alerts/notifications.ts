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

type AlertEmailContext = {
  event_id: string;
  farm_controller_id: string | null;
  farm_name: string | null;
  active_at: string | null;
  last_triggered_at: string | null;
  created_at: string | null;
  latest_value: unknown;
};

type PrimaryCondition = {
  fact: string;
  operator: string;
  value?: unknown;
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

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatPriority(priority: string) {
  return priority.toUpperCase();
}

function formatDateTime(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function normalizeDashboardUrl(baseUrl: string, farmControllerId: string | null) {
  try {
    const url = new URL(baseUrl);
    if (farmControllerId) url.searchParams.set("farm", farmControllerId);
    url.hash = "alerts";
    return url.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const farmPart = farmControllerId ? `${separator}farm=${encodeURIComponent(farmControllerId)}` : "";
    return `${baseUrl}${farmPart}#alerts`;
  }
}

function findPrimaryCondition(rule: AlertRule): PrimaryCondition | null {
  const condition = rule.condition_json as unknown;

  if (!condition || typeof condition !== "object") return null;

  const direct = condition as Partial<PrimaryCondition>;
  if (typeof direct.fact === "string" && typeof direct.operator === "string") {
    return {
      fact: direct.fact,
      operator: direct.operator,
      value: direct.value,
    };
  }

  const grouped = condition as { all?: unknown[]; any?: unknown[] };
  const first = (Array.isArray(grouped.all) ? grouped.all[0] : undefined) ??
    (Array.isArray(grouped.any) ? grouped.any[0] : undefined);

  if (!first || typeof first !== "object") return null;

  const firstCondition = first as Partial<PrimaryCondition>;
  if (typeof firstCondition.fact !== "string" || typeof firstCondition.operator !== "string") return null;

  return {
    fact: firstCondition.fact,
    operator: firstCondition.operator,
    value: firstCondition.value,
  };
}

async function loadAlertEmailContext(eventId: string): Promise<AlertEmailContext | null> {
  const result = await pool.query(
    `
      SELECT
        ae.id::text AS event_id,
        ae.farm_controller_id::text,
        fr.farm_name,
        ae.active_at,
        ae.last_triggered_at,
        ae.created_at,
        ae.latest_value
      FROM alert_events ae
      LEFT JOIN farm_registry fr
        ON fr.controller_id = ae.farm_controller_id
      WHERE ae.id = $1
      LIMIT 1;
    `,
    [eventId],
  );

  return result.rows[0] ?? null;
}

function buildAlertEmail(rule: AlertRule, eventId: string, context: AlertEmailContext | null) {
  const dashboardUrl = appUrl();
  const farmControllerId = context?.farm_controller_id ?? rule.farm_controller_id ?? null;
  const farmName = context?.farm_name ?? farmControllerId ?? "All farms";
  const condition = findPrimaryCondition(rule);
  const alertTime = context?.active_at ?? context?.last_triggered_at ?? context?.created_at ?? new Date().toISOString();
  const viewUrl = dashboardUrl ? normalizeDashboardUrl(dashboardUrl, farmControllerId) : null;

  const subject = `[${farmName}] ${rule.name}: ${formatPriority(rule.priority)}`;
  const bodyLines = [
    `Farm ID: ${escapeHtml(farmControllerId ?? "All farms")}`,
    `Farm Name: ${escapeHtml(farmName)}`,
    `Date/Time: ${escapeHtml(formatDateTime(alertTime))}`,
    "",
    `Rule Name: ${escapeHtml(rule.name)}`,
    `Priority: ${escapeHtml(formatPriority(rule.priority))}`,
    `Metric: ${escapeHtml(rule.metric_key)}`,
    `Threshold Value: ${escapeHtml(formatValue(condition?.value))}`,
    `Current Value: ${escapeHtml(formatValue(context?.latest_value))}`,
    `Condition: ${escapeHtml(condition?.operator ?? "N/A")}`,
    "",
    `View Alert at: ${viewUrl ? `<a href="${escapeHtml(viewUrl)}">${escapeHtml(viewUrl)}</a>` : "N/A"}`,
  ];

  return {
    subject,
    body: bodyLines.join("<br />\n"),
  };
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
  const context = await loadAlertEmailContext(eventIdText);
  const { subject, body } = buildAlertEmail(rule, eventIdText, context);
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
    const notificationId = await reserveNotification(eventIdText, channel, subject, body);

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
