"use client";

import { useEffect, useMemo, useState } from "react";

type TemperatureUnit = "C" | "F";

type ConfigSnapshot = {
  config_name: string;
  source_filename: string;
  captured_at: string;
  payload_updated_at: string | null;
  payload_recipe_id: string | null;
  payload_recipe_name: string | null;
  config_payload: Record<string, unknown>;
};

type RecipeApiResponse = {
  ok: boolean;
  generated_at?: string;
  count?: number;
  configs?: Record<string, ConfigSnapshot>;
  error?: string;
};

type TargetCard = {
  label: string;
  day: string;
  night: string;
  helper?: string;
};

type TimingCard = {
  label: string;
  value: string;
  helper?: string;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberSetting(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberSetting(source, key);
    if (value !== null) return value;
  }
  return null;
}

function firstNumberFrom(local: Record<string, unknown>, global: Record<string, unknown>, keys: string[]): number | null {
  const localValue = firstNumber(local, keys);
  if (localValue !== null) return localValue;
  return firstNumber(global, keys);
}

function textSetting(source: Record<string, unknown>, key: string, fallback = "—") {
  const value = source[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function celsiusToFahrenheit(value: number) {
  return value * (9 / 5) + 32;
}

function formatTemperature(value: number | null, unit: TemperatureUnit) {
  if (value === null) return "—";
  if (unit === "F") return `${celsiusToFahrenheit(value).toFixed(1)} °F`;
  return `${value.toFixed(1)} °C`;
}

function formatNumber(value: number | null, unit = "") {
  if (value === null) return "—";
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatSeconds(value: number | null) {
  if (value === null) return "—";
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} hr`);
  if (minutes) parts.push(`${minutes} min`);
  if (seconds || parts.length === 0) parts.push(`${seconds} sec`);
  return parts.join(" ");
}

function formatClockFromUtcSeconds(value: number | null) {
  if (value === null) return "—";
  const seconds = ((Math.round(value) % 86400) + 86400) % 86400;
  const date = new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function doseVolume(seconds: number | null, mlPerMinute: number | null) {
  if (seconds === null || mlPerMinute === null) return "—";
  return `${((seconds / 60) * mlPerMinute).toFixed(1)} mL`;
}

function enabled(value: number | null) {
  if (value === null) return "—";
  return value === 1 ? "Enabled" : "Disabled";
}

function SectionHeader({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) {
  return (
    <div className="recipe-section-header">
      <p className="zone-kicker">{kicker}</p>
      <h2>{title}</h2>
      {copy ? <p>{copy}</p> : null}
    </div>
  );
}

function TargetGrid({ cards }: { cards: TargetCard[] }) {
  return (
    <div className="recipe-target-grid">
      {cards.map((card) => (
        <article className="recipe-target-card" key={card.label}>
          <span>{card.label}</span>
          <div className="target-pair">
            <div>
              <small>Day</small>
              <strong>{card.day}</strong>
            </div>
            <div>
              <small>Night</small>
              <strong>{card.night}</strong>
            </div>
          </div>
          {card.helper ? <p>{card.helper}</p> : null}
        </article>
      ))}
    </div>
  );
}

function ClimateMatrix({ cards }: { cards: TargetCard[] }) {
  return (
    <div className="recipe-climate-matrix">
      <div className="climate-matrix-header">
        <span>Target</span>
        <strong>Day</strong>
        <strong>Night</strong>
      </div>
      {cards.map((card) => (
        <div className="climate-matrix-row" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.day}</strong>
          <strong>{card.night}</strong>
        </div>
      ))}
    </div>
  );
}

function TimingGrid({ cards, compact = false }: { cards: TimingCard[]; compact?: boolean }) {
  return (
    <div className={compact ? "recipe-timing-grid recipe-timing-grid-compact" : "recipe-timing-grid"}>
      {cards.map((card) => (
        <article className={compact ? "recipe-timing-card recipe-timing-card-compact" : "recipe-timing-card"} key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          {card.helper ? <small>{card.helper}</small> : null}
        </article>
      ))}
    </div>
  );
}

function ContainerRecipePanel({ targets, schedule }: { targets: TargetCard[]; schedule: TimingCard[] }) {
  return (
    <section className="recipe-panel recipe-zone-panel recipe-container-panel">
      <SectionHeader
        kicker="Container Zone"
        title="Container climate recipe"
        copy="Farm-wide day/night environmental targets and recipe timing."
      />
      <div className="recipe-container-layout">
        <ClimateMatrix cards={targets} />
        <TimingGrid cards={schedule} compact />
      </div>
    </section>
  );
}

function ZoneRecipePanel({
  zone,
  title,
  copy,
  targets,
  timingSections,
}: {
  zone: string;
  title: string;
  copy: string;
  targets?: TargetCard[];
  timingSections: { title: string; cards: TimingCard[] }[];
}) {
  return (
    <section className="recipe-panel recipe-zone-panel">
      <SectionHeader kicker={`${zone} Zone`} title={title} copy={copy} />
      {targets && targets.length > 0 ? <TargetGrid cards={targets} /> : null}
      {timingSections.map((section) => (
        <div className="recipe-zone-subsection" key={section.title}>
          <h3 className="recipe-subtitle">{section.title}</h3>
          <TimingGrid cards={section.cards} />
        </div>
      ))}
    </section>
  );
}

function SafetySummary({ rules, actions, modes }: { rules: Record<string, unknown>; actions: Record<string, unknown>; modes: Record<string, unknown> }) {
  const ruleCount = Object.keys(rules).length;
  const actionCount = Object.keys(actions).length;
  const modeCount = Object.keys(modes).length;

  const safetyCards: TimingCard[] = [
    { label: "Programming rules", value: formatNumber(ruleCount), helper: "Condition logic from programming_rules" },
    { label: "Action sets", value: formatNumber(actionCount), helper: "Command recipes from programming_actions" },
    { label: "Modes", value: formatNumber(modeCount), helper: "Calibration, cleaning, and task modes" },
  ];

  return (
    <section className="recipe-panel">
      <SectionHeader
        kicker="Logic"
        title="Safety and automation map"
        copy="This read-only section summarizes the controller logic available for future rule-to-action visualization."
      />
      <TimingGrid cards={safetyCards} />
    </section>
  );
}

export default function RecipeDashboard({ temperatureUnit = "C" }: { temperatureUnit?: TemperatureUnit }) {
  const [payload, setPayload] = useState<RecipeApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRecipe() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/recipe/current", { cache: "no-store" });
        const nextPayload = (await response.json()) as RecipeApiResponse;
        if (!response.ok || !nextPayload.ok) {
          throw new Error(nextPayload.error ?? "Failed to load recipe configuration.");
        }
        if (active) setPayload(nextPayload);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unknown recipe error");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRecipe();
    return () => {
      active = false;
    };
  }, []);

  const parsed = useMemo(() => {
    const configs = payload?.configs ?? {};
    const local = getRecord(configs.local_settings?.config_payload);
    const global = getRecord(configs.global_settings?.config_payload);
    const rules = getRecord(configs.programming_rules?.config_payload);
    const actions = getRecord(configs.programming_actions?.config_payload);
    const modes = getRecord(configs.programming_modes?.config_payload);
    const meta = getRecord(local.meta);

    const recipeName = textSetting(local, "recipe_name", configs.local_settings?.payload_recipe_name ?? "Current recipe");
    const recipeDescription = textSetting(meta, "recipe_description", "No recipe description provided.");
    const recipeId = textSetting(meta, "recipe_id", configs.local_settings?.payload_recipe_id ?? "—");
    const configType = textSetting(local, "config_type", textSetting(global, "config_type", "—"));
    const units = textSetting(local, "units", textSetting(global, "units", "—"));
    const dayLength = firstNumberFrom(local, global, ["pgm_day_length", "day_length"]);
    const dayStart = firstNumberFrom(local, global, ["day_start"]);
    const nightStart = dayStart !== null && dayLength !== null ? dayStart + dayLength : null;

    const climateTargets: TargetCard[] = [
      {
        label: "Air Temp",
        day: formatTemperature(numberSetting(local, "pgm_day_temperature"), temperatureUnit),
        night: formatTemperature(numberSetting(local, "pgm_night_temperature"), temperatureUnit),
      },
      {
        label: "Humidity",
        day: formatNumber(numberSetting(local, "pgm_day_rh"), "%"),
        night: formatNumber(numberSetting(local, "pgm_night_rh"), "%"),
      },
      {
        label: "CO₂",
        day: formatNumber(numberSetting(local, "pgm_day_co2"), "ppm"),
        night: formatNumber(numberSetting(local, "pgm_night_co2"), "ppm"),
      },
    ];

    const nurseryTargets: TargetCard[] = [
      {
        label: "Nursery EC",
        day: formatNumber(numberSetting(local, "pgm_nursery_day_ec"), "µS/cm"),
        night: formatNumber(numberSetting(local, "pgm_nursery_night_ec"), "µS/cm"),
      },
      {
        label: "Nursery pH",
        day: formatNumber(numberSetting(local, "pgm_nursery_day_ph")),
        night: formatNumber(numberSetting(local, "pgm_nursery_night_ph")),
      },
    ];

    const cultivationTargets: TargetCard[] = [
      {
        label: "Cultivation EC",
        day: formatNumber(numberSetting(local, "pgm_cultivation_day_ec"), "µS/cm"),
        night: formatNumber(numberSetting(local, "pgm_cultivation_night_ec"), "µS/cm"),
      },
      {
        label: "Cultivation pH",
        day: formatNumber(numberSetting(local, "pgm_cultivation_day_ph")),
        night: formatNumber(numberSetting(local, "pgm_cultivation_night_ph")),
      },
    ];

    const nurseryFlow = firstNumberFrom(local, global, ["pgm_nursery_dosing_flow_rate", "nursery_dosing_flowrate_ml_per_min", "dosing_flow_rate"]);
    const cultivationFlow = firstNumberFrom(local, global, ["pgm_cultivation_dosing_flow_rate", "cultivation_dosing_flowrate_ml_per_min", "dosing_flow_rate"]);

    const nurseryEcA = firstNumberFrom(local, global, ["nursery_ec_a_dose_length_three_part", "pgm_nursery_ec_a_dose_length", "nursery_ec_a_dose_length"]);
    const nurseryEcB = firstNumberFrom(local, global, ["nursery_ec_b_dose_length_three_part", "pgm_nursery_ec_b_dose_length", "nursery_ec_b_dose_length"]);
    const nurseryEcC = firstNumberFrom(local, global, ["nursery_ec_c_dose_length_three_part", "pgm_nursery_ec_c_dose_length", "nursery_ec_c_dose_length"]);
    const nurseryPhDown = firstNumberFrom(local, global, ["pgm_nursery_ph_down_dose_length", "nursery_ph_down_dose_length"]);
    const nurseryPhUp = firstNumberFrom(local, global, ["pgm_nursery_ph_up_dose_length", "nursery_ph_up_dose_length"]);

    const cultivationEcA = firstNumberFrom(local, global, ["cultivation_ec_a_dose_length_three_part", "pgm_cultivation_ec_a_dose_length", "cultivation_ec_a_dose_length"]);
    const cultivationEcB = firstNumberFrom(local, global, ["cultivation_ec_b_dose_length_three_part", "pgm_cultivation_ec_b_dose_length", "cultivation_ec_b_dose_length"]);
    const cultivationEcC = firstNumberFrom(local, global, ["cultivation_ec_c_dose_length_three_part", "pgm_cultivation_ec_c_dose_length", "cultivation_ec_c_dose_length"]);
    const cultivationPhDown = firstNumberFrom(local, global, ["pgm_cultivation_ph_down_dose_length", "cultivation_ph_down_dose_length"]);
    const cultivationPhUp = firstNumberFrom(local, global, ["pgm_cultivation_ph_up_dose_length", "cultivation_ph_up_dose_length"]);

    const containerSchedule: TimingCard[] = [
      { label: "Day Start", value: formatClockFromUtcSeconds(dayStart), helper: "local display from controller time" },
      { label: "Night Start", value: formatClockFromUtcSeconds(nightStart), helper: "day start + day length" },
      { label: "Day Length", value: formatSeconds(dayLength) },
    ];

    const nurseryTiming: TimingCard[] = [
      { label: "Water cycle", value: formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_water_cycle_length", "pgm_nursery_cycle_length", "nursery_cycle_length"])) },
      { label: "Top water length", value: formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_top_water_length", "nursery_top_water_length"])) },
      { label: "Bottom water length", value: formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_bottom_water_length", "nursery_bottom_water_length"])) },
      { label: "Water offset", value: formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_water_offset", "nursery_water_offset"])) },
      { label: "Top water", value: enabled(firstNumberFrom(local, global, ["nursery_top_water_enable", "pgm_nursery_top_water_enable"])) },
      { label: "Bottom water", value: enabled(firstNumberFrom(local, global, ["nursery_bottom_water_enable", "pgm_nursery_bottom_water_enable"])) },
      { label: "Recirculation", value: enabled(firstNumberFrom(local, global, ["nursery_recirc_enable", "pgm_nursery_recirculation_enable", "nursery_recirculation_enable"])) },
      { label: "EC autodose", value: enabled(firstNumberFrom(local, global, ["nursery_autodose_enable_ec", "pgm_nursery_autodose_enable_ec"])) },
      { label: "pH autodose", value: enabled(firstNumberFrom(local, global, ["nursery_autodose_enable_ph", "pgm_nursery_autodose_enable_ph"])) },
    ];

    const cultivationTiming: TimingCard[] = [
      { label: "Water cycle", value: formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_water_cycle_length", "pgm_cultivation_cycle_length", "cultivation_cycle_length"])) },
      { label: "Left water length", value: formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_left_water_length", "cultivation_left_water_length"])) },
      { label: "Right water length", value: formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_right_water_length", "cultivation_right_water_length"])) },
      { label: "Water offset", value: formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_water_offset", "cultivation_water_offset"])) },
      { label: "Left water", value: enabled(firstNumberFrom(local, global, ["cultivation_left_water_enable", "pgm_cultivation_left_water_enable"])) },
      { label: "Right water", value: enabled(firstNumberFrom(local, global, ["cultivation_right_water_enable", "pgm_cultivation_right_water_enable"])) },
      { label: "Recirculation", value: enabled(firstNumberFrom(local, global, ["cultivation_recirc_enable", "pgm_cultivation_recirculation_enable", "cultivation_recirculation_enable"])) },
      { label: "EC autodose", value: enabled(firstNumberFrom(local, global, ["cultivation_autodose_enable_ec", "pgm_cultivation_autodose_enable_ec"])) },
      { label: "pH autodose", value: enabled(firstNumberFrom(local, global, ["cultivation_autodose_enable_ph", "pgm_cultivation_autodose_enable_ph"])) },
    ];

    const nurseryDosing: TimingCard[] = [
      { label: "Nutrient A dose", value: formatSeconds(nurseryEcA), helper: doseVolume(nurseryEcA, nurseryFlow) },
      { label: "Nutrient B dose", value: formatSeconds(nurseryEcB), helper: doseVolume(nurseryEcB, nurseryFlow) },
      { label: "Nutrient C dose", value: formatSeconds(nurseryEcC), helper: doseVolume(nurseryEcC, nurseryFlow) },
      { label: "pH Down dose", value: formatSeconds(nurseryPhDown), helper: doseVolume(nurseryPhDown, nurseryFlow) },
      { label: "pH Up dose", value: formatSeconds(nurseryPhUp), helper: doseVolume(nurseryPhUp, nurseryFlow) },
      { label: "Flow rate", value: formatNumber(nurseryFlow, "mL/min") },
    ];

    const cultivationDosing: TimingCard[] = [
      { label: "Nutrient A dose", value: formatSeconds(cultivationEcA), helper: doseVolume(cultivationEcA, cultivationFlow) },
      { label: "Nutrient B dose", value: formatSeconds(cultivationEcB), helper: doseVolume(cultivationEcB, cultivationFlow) },
      { label: "Nutrient C dose", value: formatSeconds(cultivationEcC), helper: doseVolume(cultivationEcC, cultivationFlow) },
      { label: "pH Down dose", value: formatSeconds(cultivationPhDown), helper: doseVolume(cultivationPhDown, cultivationFlow) },
      { label: "pH Up dose", value: formatSeconds(cultivationPhUp), helper: doseVolume(cultivationPhUp, cultivationFlow) },
      { label: "Flow rate", value: formatNumber(cultivationFlow, "mL/min") },
    ];

    const nurseryLighting: TimingCard[] = [
      { label: "Top red", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_top_red_light_on_delay", "pgm_nursery_top_red_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_top_red_light_off_delay", "pgm_nursery_top_red_off_delay"]))}` },
      { label: "Top blue", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_top_blue_light_on_delay", "pgm_nursery_top_blue_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_top_blue_light_off_delay", "pgm_nursery_top_blue_off_delay"]))}` },
      { label: "Bottom red", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_bottom_red_light_on_delay", "pgm_nursery_bottom_red_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_bottom_red_light_off_delay", "pgm_nursery_bottom_red_off_delay"]))}` },
      { label: "Bottom blue", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_bottom_blue_light_on_delay", "pgm_nursery_bottom_blue_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_nursery_bottom_blue_light_off_delay", "pgm_nursery_bottom_blue_off_delay"]))}` },
    ];

    const cultivationLighting: TimingCard[] = [
      { label: "Left red", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_left_red_light_on_delay", "pgm_cultivation_left_red_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_left_red_light_off_delay", "pgm_cultivation_left_red_off_delay"]))}` },
      { label: "Left blue", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_left_blue_light_on_delay", "pgm_cultivation_left_blue_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_left_blue_light_off_delay", "pgm_cultivation_left_blue_off_delay"]))}` },
      { label: "Right red", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_right_red_light_on_delay", "pgm_cultivation_right_red_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_right_red_light_off_delay", "pgm_cultivation_right_red_off_delay"]))}` },
      { label: "Right blue", value: `${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_right_blue_light_on_delay", "pgm_cultivation_right_blue_on_delay"]))} → ${formatSeconds(firstNumberFrom(local, global, ["pgm_cultivation_right_blue_light_off_delay", "pgm_cultivation_right_blue_off_delay"]))}` },
    ];

    return {
      configs,
      local,
      rules,
      actions,
      modes,
      overview: {
        recipeName,
        recipeDescription,
        recipeId,
        configType,
        units,
        capturedAt: configs.local_settings?.captured_at,
        updatedAt: configs.local_settings?.payload_updated_at,
      },
      climateTargets,
      nurseryTargets,
      cultivationTargets,
      containerSchedule,
      nurseryTiming,
      cultivationTiming,
      nurseryDosing,
      cultivationDosing,
      nurseryLighting,
      cultivationLighting,
    };
  }, [payload, temperatureUnit]);

  if (loading) {
    return <div className="recipe-loading">Loading recipe configuration...</div>;
  }

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  if (!payload?.ok || !parsed.configs.local_settings) {
    return <div className="empty-zone">No imported local_settings recipe snapshot was found.</div>;
  }

  return (
    <section className="recipe-dashboard">
      <article className="recipe-hero-panel">
        <div>
          <p className="zone-kicker">Recipe overview</p>
          <h2>{parsed.overview.recipeName}</h2>
          <p>{parsed.overview.recipeDescription}</p>
        </div>
        <div className="recipe-meta-grid">
          <div><span>Recipe ID</span><strong>{parsed.overview.recipeId}</strong></div>
          <div><span>Config type</span><strong>{parsed.overview.configType}</strong></div>
          <div><span>Units</span><strong>{parsed.overview.units}</strong></div>
          <div><span>Imported</span><strong>{formatTimestamp(parsed.overview.capturedAt)}</strong></div>
        </div>
      </article>

      <ContainerRecipePanel targets={parsed.climateTargets} schedule={parsed.containerSchedule} />

      <ZoneRecipePanel
        zone="Nursery"
        title="Nursery recipe"
        copy="Nursery chemistry, irrigation, lighting, recirculation, and dose timing values."
        targets={parsed.nurseryTargets}
        timingSections={[
          { title: "Watering and operation", cards: parsed.nurseryTiming },
          { title: "Lighting", cards: parsed.nurseryLighting },
          { title: "Dosing summary", cards: parsed.nurseryDosing },
        ]}
      />

      <ZoneRecipePanel
        zone="Cultivation"
        title="Cultivation recipe"
        copy="Cultivation chemistry, irrigation, lighting, recirculation, and dosing values."
        targets={parsed.cultivationTargets}
        timingSections={[
          { title: "Watering and operation", cards: parsed.cultivationTiming },
          { title: "Lighting", cards: parsed.cultivationLighting },
          { title: "Dosing summary", cards: parsed.cultivationDosing },
        ]}
      />

      <SafetySummary rules={parsed.rules} actions={parsed.actions} modes={parsed.modes} />
    </section>
  );
}
