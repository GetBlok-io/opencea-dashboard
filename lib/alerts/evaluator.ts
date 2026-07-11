import { Engine, RuleProperties } from "json-rules-engine";
import { pool } from "@/lib/db";
import { resolveFarmSelection } from "@/lib/farms";
import { collectMonitoringFacts } from "./facts";
import { AlertRuleSchema, type AlertEvaluationResult, type AlertFacts, type AlertRule } from "./types";

function toRuleProperties(rule: AlertRule): RuleProperties {
  return {
    conditions: rule.condition_json as RuleProperties["conditions"],
    event: {
      type: "alert-triggered",
      params: {
        ruleId: rule.id,
      },
    },
    priority: priorityWeight(rule.priority),
  };
}

function priorityWeight(priority: AlertRule["priority"]) {
  switch (priority) {
    case "emergency":
      return 100;
    case "critical":
      return 75;
    case "warning":
      return 50;
    case "info":
    default:
      return 25;
  }
}

function jsonValue(value: unknown) {
  return value === undefined ? null : value;
}

async function loadEnabledRules(): Promise<AlertRule[]> {
  const result = await pool.query(`
    SELECT
      id,
      farm_controller_id::text,
      name,
      description,
      enabled,
      source_type,
      metric_key,
      condition_json,
      soak_seconds,
      notification_delay_seconds,
      cooldown_seconds,
      priority
    FROM alert_rules
    WHERE enabled = true AND deleted_at IS NULL
    ORDER BY priority DESC, id ASC;
  `);

  return result.rows.map((row) => AlertRuleSchema.parse({
    ...row,
    id: Number(row.id),
    soak_seconds: Number(row.soak_seconds),
    notification_delay_seconds: Number(row.notification_delay_seconds),
    cooldown_seconds: Number(row.cooldown_seconds),
  }));
}

async function evaluateRule(rule: AlertRule): Promise<AlertEvaluationResult> {
  const selection = await resolveFarmSelection(rule.farm_controller_id);
  const facts = await collectMonitoringFacts(selection);

  const engine = new Engine([], { allowUndefinedFacts: true });
  engine.addRule(toRuleProperties(rule));

  const result = await engine.run(facts);
  const triggered = result.events.some((event) => event.type === "alert-triggered");

  return {
    rule,
    triggered,
    value: facts[rule.metric_key] ?? null,
    facts,
  };
}

async function upsertAlertEvent(result: AlertEvaluationResult) {
  const { rule, triggered, value, facts } = result;

  const openEventResult = await pool.query(
    `
      SELECT *
      FROM alert_events
      WHERE alert_rule_id = $1
        AND status IN ('pending', 'active', 'suppressed')
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [rule.id],
  );

  const openEvent = openEventResult.rows[0] ?? null;

  if (!triggered) {
    if (openEvent) {
      await pool.query(
        `
          UPDATE alert_events
          SET
            status = 'resolved',
            resolved_at = NOW(),
            suppressed_until = NULL,
            latest_value = $2::jsonb,
            context_json = $3::jsonb,
            updated_at = NOW()
          WHERE id = $1;
        `,
        [
          openEvent.id,
          JSON.stringify(jsonValue(value)),
          JSON.stringify({ facts }),
        ],
      );
    }

    return { action: openEvent ? "resolved" : "unchanged" };
  }

  if (!openEvent) {
    const status = rule.soak_seconds > 0 ? "pending" : "active";
    const activeAtSql = rule.soak_seconds > 0 ? "NULL" : "NOW()";

    const insertResult = await pool.query(
      `
        INSERT INTO alert_events (
          alert_rule_id,
          farm_controller_id,
          status,
          first_triggered_at,
          last_triggered_at,
          active_at,
          latest_value,
          context_json
        )
        VALUES (
          $1,
          $2::uuid,
          $3,
          NOW(),
          NOW(),
          ${activeAtSql},
          $4::jsonb,
          $5::jsonb
        )
        RETURNING id, status;
      `,
      [
        rule.id,
        rule.farm_controller_id,
        status,
        JSON.stringify(jsonValue(value)),
        JSON.stringify({ facts }),
      ],
    );

    return {
      action: "created",
      eventId: insertResult.rows[0]?.id,
      status: insertResult.rows[0]?.status,
    };
  }

  const now = new Date();
  const suppressedUntil = openEvent.suppressed_until ? new Date(openEvent.suppressed_until) : null;

  if (openEvent.status === "suppressed" && suppressedUntil && suppressedUntil > now) {
    await pool.query(
      `
        UPDATE alert_events
        SET
          last_triggered_at = NOW(),
          latest_value = $2::jsonb,
          context_json = $3::jsonb,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [
        openEvent.id,
        JSON.stringify(jsonValue(value)),
        JSON.stringify({ facts }),
      ],
    );

    return {
      action: "suppressed",
      eventId: openEvent.id,
      status: "suppressed",
      suppressedUntil: openEvent.suppressed_until,
    };
  }

  if (openEvent.status === "suppressed") {
    await pool.query(
      `
        UPDATE alert_events
        SET
          status = 'active',
          active_at = COALESCE(active_at, NOW()),
          suppressed_until = NULL,
          last_triggered_at = NOW(),
          latest_value = $2::jsonb,
          context_json = $3::jsonb,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [
        openEvent.id,
        JSON.stringify(jsonValue(value)),
        JSON.stringify({ facts }),
      ],
    );

    return {
      action: "reactivated",
      eventId: openEvent.id,
      status: "active",
    };
  }

  const firstTriggeredAt = new Date(openEvent.first_triggered_at).getTime();
  const soakMet = Date.now() - firstTriggeredAt >= rule.soak_seconds * 1000;
  const nextStatus = openEvent.status === "pending" && soakMet ? "active" : openEvent.status;
  const activeAtUpdate = openEvent.status === "pending" && soakMet ? ", active_at = NOW()" : "";

  await pool.query(
    `
      UPDATE alert_events
      SET
        status = $2,
        last_triggered_at = NOW(),
        latest_value = $3::jsonb,
        context_json = $4::jsonb,
        updated_at = NOW()
        ${activeAtUpdate}
      WHERE id = $1;
    `,
    [
      openEvent.id,
      nextStatus,
      JSON.stringify(jsonValue(value)),
      JSON.stringify({ facts }),
    ],
  );

  return {
    action: nextStatus === "active" && openEvent.status === "pending" ? "activated" : "updated",
    eventId: openEvent.id,
    status: nextStatus,
  };
}

export async function evaluateAlerts() {
  const rules = await loadEnabledRules();
  const results = [];

  for (const rule of rules) {
    if (rule.source_type !== "monitoring") {
      results.push({
        ruleId: rule.id,
        skipped: true,
        reason: "Only monitoring rules are supported in this MVP evaluator.",
      });
      continue;
    }

    const evaluation = await evaluateRule(rule);
    const eventAction = await upsertAlertEvent(evaluation);

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: evaluation.triggered,
      value: evaluation.value,
      eventAction,
    });
  }

  return {
    evaluated: results.length,
    results,
  };
}
