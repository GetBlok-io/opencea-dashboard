"use client";

import { useEffect, useState } from "react";

type AlertPriority = "info" | "warning" | "critical" | "emergency";
type RecipientType = "person" | "role" | "group";
type ChannelType = "email" | "sms";

type AlertRecipientChannel = {
  id?: string;
  channel_type: ChannelType;
  destination: string;
  enabled: boolean;
  priority_minimum: AlertPriority;
  quiet_hours_json?: Record<string, unknown> | null;
};

type AlertRecipientRow = {
  id: string;
  name: string;
  recipient_type: RecipientType;
  enabled: boolean;
  notes: string | null;
  channels: AlertRecipientChannel[];
};

type RecipientApiResponse = {
  ok: boolean;
  generated_at?: string;
  data?: AlertRecipientRow;
  error?: string;
};

type EditableChannel = {
  local_id: string;
  channel_type: ChannelType;
  destination: string;
  enabled: boolean;
  priority_minimum: AlertPriority;
  quiet_hours_text: string;
};

const PRIORITIES: AlertPriority[] = ["info", "warning", "critical", "emergency"];
const RECIPIENT_TYPES: RecipientType[] = ["person", "role", "group"];
const CHANNEL_TYPES: ChannelType[] = ["email", "sms"];

function quietHoursToText(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value, null, 2) : "";
}

function channelToEditable(channel: AlertRecipientChannel, index: number): EditableChannel {
  return {
    local_id: channel.id ?? `channel-${index}-${Date.now()}`,
    channel_type: channel.channel_type,
    destination: channel.destination,
    enabled: channel.enabled,
    priority_minimum: channel.priority_minimum,
    quiet_hours_text: quietHoursToText(channel.quiet_hours_json),
  };
}

export default function AlertRecipientEditModal({
  recipientId,
  onSaved,
  onCancel,
}: {
  recipientId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("person");
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [channels, setChannels] = useState<EditableChannel[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecipient() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/alerts/recipients/${recipientId}`, { cache: "no-store" });
        const payload = (await response.json()) as RecipientApiResponse;

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Failed to load alert recipient.");
        }

        if (cancelled) return;

        setName(payload.data.name);
        setRecipientType(payload.data.recipient_type);
        setEnabled(payload.data.enabled);
        setNotes(payload.data.notes ?? "");
        setChannels(payload.data.channels.map(channelToEditable));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown alert recipient load error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecipient();

    return () => {
      cancelled = true;
    };
  }, [recipientId]);

  function updateChannel(localId: string, patch: Partial<EditableChannel>) {
    setChannels((current) => current.map((channel) => (
      channel.local_id === localId ? { ...channel, ...patch } : channel
    )));
  }

  function addChannel(channelType: ChannelType = "email") {
    setChannels((current) => [
      ...current,
      {
        local_id: `new-${Date.now()}-${current.length}`,
        channel_type: channelType,
        destination: "",
        enabled: true,
        priority_minimum: "info",
        quiet_hours_text: "",
      },
    ]);
  }

  function removeChannel(localId: string) {
    setChannels((current) => current.filter((channel) => channel.local_id !== localId));
  }

  function payloadChannels() {
    return channels.map((channel) => {
      let quietHoursJson: Record<string, unknown> | null = null;
      const quietHoursText = channel.quiet_hours_text.trim();

      if (quietHoursText) {
        const parsed = JSON.parse(quietHoursText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Quiet hours must be a JSON object, or left blank.");
        }
        quietHoursJson = parsed as Record<string, unknown>;
      }

      return {
        channel_type: channel.channel_type,
        destination: channel.destination.trim(),
        enabled: channel.enabled,
        priority_minimum: channel.priority_minimum,
        quiet_hours_json: quietHoursJson,
      };
    });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const nextChannels = payloadChannels();
      const missingDestination = nextChannels.find((channel) => !channel.destination);
      if (missingDestination) {
        throw new Error("Each channel must have a destination.");
      }

      const response = await fetch(`/api/alerts/recipients/${recipientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          name: name.trim(),
          recipient_type: recipientType,
          enabled,
          notes: notes.trim() ? notes.trim() : null,
          channels: nextChannels,
        }),
      });

      const payload = (await response.json()) as RecipientApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update alert recipient.");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown alert recipient save error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card recipient-modal-card" role="dialog" aria-modal="true" aria-labelledby="recipient-edit-title">
        <div className="modal-header">
          <div>
            <p className="zone-kicker">Alert routing</p>
            <h2 id="recipient-edit-title">Edit recipient</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Close recipient editor">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="empty-zone">Loading recipient...</div>
        ) : (
          <form className="alert-rule-form recipient-edit-form" onSubmit={handleSave}>
            <div className="alert-form-grid">
              <label>
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>

              <label>
                <span>Type</span>
                <select value={recipientType} onChange={(event) => setRecipientType(event.target.value as RecipientType)}>
                  {RECIPIENT_TYPES.map((item) => (
                    <option value={item} key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="alert-checkbox-label">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                <span>Recipient enabled</span>
              </label>
            </div>

            <label>
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </label>

            <div className="recipient-channel-header">
              <div>
                <p className="zone-kicker">Channels</p>
                <h3>Email / SMS destinations</h3>
              </div>
              <div className="rule-action-buttons">
                <button type="button" onClick={() => addChannel("email")}>Add email</button>
                <button type="button" onClick={() => addChannel("sms")}>Add SMS</button>
              </div>
            </div>

            {channels.length > 0 ? (
              <div className="recipient-channel-list">
                {channels.map((channel) => (
                  <article className="recipient-channel-card" key={channel.local_id}>
                    <div className="alert-form-grid">
                      <label>
                        <span>Channel</span>
                        <select
                          value={channel.channel_type}
                          onChange={(event) => updateChannel(channel.local_id, { channel_type: event.target.value as ChannelType })}
                        >
                          {CHANNEL_TYPES.map((item) => (
                            <option value={item} key={item}>{item}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Destination</span>
                        <input
                          value={channel.destination}
                          onChange={(event) => updateChannel(channel.local_id, { destination: event.target.value })}
                          placeholder={channel.channel_type === "email" ? "name@example.com" : "+14125551212"}
                          required
                        />
                      </label>

                      <label>
                        <span>Minimum priority</span>
                        <select
                          value={channel.priority_minimum}
                          onChange={(event) => updateChannel(channel.local_id, { priority_minimum: event.target.value as AlertPriority })}
                        >
                          {PRIORITIES.map((item) => (
                            <option value={item} key={item}>{item}</option>
                          ))}
                        </select>
                      </label>

                      <label className="alert-checkbox-label">
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={(event) => updateChannel(channel.local_id, { enabled: event.target.checked })}
                        />
                        <span>Channel enabled</span>
                      </label>
                    </div>

                    <label>
                      <span>Quiet hours JSON</span>
                      <textarea
                        value={channel.quiet_hours_text}
                        onChange={(event) => updateChannel(channel.local_id, { quiet_hours_text: event.target.value })}
                        rows={3}
                        placeholder='Optional, for example {"timezone":"America/New_York","start":"22:00","end":"07:00"}'
                      />
                    </label>

                    <div className="alert-form-actions">
                      <button type="button" className="danger-button" onClick={() => removeChannel(channel.local_id)}>
                        Remove channel
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-zone">No channels configured. Add email or SMS before notification delivery is enabled.</div>
            )}

            <div className="alert-form-actions modal-actions">
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save recipient"}</button>
              <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
              {error ? <span className="error-text">{error}</span> : null}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
