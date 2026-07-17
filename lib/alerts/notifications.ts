import { pool } from "@/lib/db";
import type { AlertRule } from "./types";

type AlertRecipientChannel = {
  recipient_id: string;
  recipient_name: string;
  channel_id: string;
  channel_type: "email" | "sms";
  destination: string;
};

type AlertNotificationSendResult = {
  channelId: string;
  channelType: "email" | "sms";
  destination: string;
  action: "sent" | "failed" | "skipped";
  notification