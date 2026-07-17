import { z } from "zod";

export const AlertPrioritySchema = z.enum(["info", "warning", "critical", "emergency"]);
export type AlertPriority = z.infer<typeof AlertPrioritySchema>;

export const AlertSourceTypeSchema = z.enum(["monitoring", "control", "recipe"]);
export type AlertSourceType = z.infer<typeof AlertSourceTypeSchema>;

export const AlertOperatorSchema = z.enum([
  "greaterThan",
  "greaterThanInclusive",
  "lessThan",
  "lessThanInclusive",
  "equal",
  "notEqual",
  "contains",
  "notContains",
  "isTrue",
  "isFalse",
  "exists",
  "missing",
]);

export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

export const AlertConditionSchema = z.object({
  fact: z.string().min(1),
  operator: AlertOperatorSchema,
  value: z.unknown().optional(),
});

export const AlertRuleConditionSchema = z.union([
  AlertConditionSchema,
  z.object({
    all: z.array(AlertConditionSchema).min(1),
  }),
  z.object({
    any: z.array(AlertConditionSchema).min(1),
  }),
]);

export type AlertRuleCondition = z.infer<typeof AlertRuleConditionSchema>;

export const AlertRuleSchema = z.object({
  id: z.number(),
  farm_controller_id: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  source_type: AlertSourceTypeSchema,
  metric_key: z.string(),
  condition_json: AlertRuleConditionSchema,
  soak_seconds: z.number().int().nonnegative(),
  notification_delay_seconds: z.number().int().nonnegative(),
  cooldown_seconds: z.number().int().nonnegative(),
  priority: AlertPrioritySchema,
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

export type AlertFactValue = string | number | boolean | null;

export type AlertFacts = Record<string, AlertFactValue>;

export type AlertEvaluationResult = {
  rule: AlertRule;
  triggered: boolean;
  value: AlertFactValue;
  facts: AlertFacts;
};
