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

type PrimaryCondition