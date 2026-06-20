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

type LightTiming = {
  color: "Red" | "Blue";
  onDelay: number | null;
  offDelay: number | null;
  ppfd: number;
};

type LightChannel = Omit<LightTiming, "color">;

type LightPair = {
  red: LightChannel;
  blue: LightChannel;
};

type CultivationLighting = {
  left: LightPair;
  right: LightPair;
};

type CultivationSide = "left" | "right";

const CULTIVATION_ROWS: { code: string; label: string; side: CultivationSide }[] = [
  { code: "L", label: "Left", side: "left" },
  { code: "LM", label: "Left Middle", side: "left" },
  { code: "RM", label: "Right Middle", side: "right" },
  { code: "R", label: "Right", side: "right" },
];

function findCard(cards: TimingCard[], label: string): TimingCard {
  return cards.find((card) => card.label === label) ?? { label, value: "-" };
}

function formatClock(dayStart: number | null, delay: number | null) {
  if (dayStart === null || delay === null) return "-";
  const seconds = ((Math.round(dayStart + delay) % 86400) + 86400) % 86400;
  const date = new Date(Date.UTC(2026, 5, 1, 0, 0, seconds));
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.NEXT_PUBLIC_FARM_TIME_ZONE ?? "America/New_York",
  }).format(date);
}

function durationSeconds(onDelay: number | null, offDelay: number | null) {
  if (onDelay === null || offDelay === null) return null;
  return ((offDelay - onDelay) % 86400 + 86400) % 86400;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

function dliForLight(ppfd: number, seconds: number | null) {
  if (seconds === null) return 0;
  return (ppfd * seconds) / 1_000_000;
}

function formatDli(value: number) {
  if (value < 0.05) return "0";
  return value.toFixed(1).replace(/\.0$/, "");
}

function sideTitle(side: CultivationSide) {
  return side === "left" ? "Left + Left Middle" : "Right Middle + Right";
}

function sideCode(side: CultivationSide) {
  return side === "left" ? "L / LM" : "RM / R";
}

function sideCards(side: CultivationSide, timing: TimingCard[]) {
  return {
    waterLength: findCard(timing, side === "left" ? "Left water length" : "Right water length"),
    waterEnable: findCard(timing, side === "left" ? "Left water" : "Right water"),
    water24h: findCard(timing, side === "left" ? "Left 24h water" : "Right 24h water"),
  };
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.trim().toLowerCase();
  const enabled = normalized === "enabled" || normalized === "on" || normalized === "active";
  const unknown = value === "-";

  return (
    <span className={unknown ? "recipe-status-pill unknown" : enabled ? "recipe-status-pill enabled" : "recipe-status-pill disabled"}>
      <span className="recipe-status-dot" />
      {value}
    </span>
  );
}

function ClimateMatrix({ cards }: { cards: TargetCard[] }) {
  return (
    <div className="recipe-climate-matrix" role="table" aria-label="Cultivation day and night recipe targets">
      <div className="climate-matrix-header" role="row">
        <span role="columnheader">Metric</span>
        <strong role="columnheader">Day Time</strong>
        <strong role="columnheader">Night Time</strong>
      </div>
      {cards.map((card) => (
        <div className="climate-matrix-row" role="row" key={card.label}>
          <span role="rowheader">{card.label}</span>
          <strong role="cell">{card.day}</strong>
          <strong role="cell">{card.night}</strong>
        </div>
      ))}
    </div>
  );
}

function TimingGrid({ cards }: { cards: TimingCard[] }) {
  return (
    <div className="recipe-timing-grid">
      {cards.map((card) => (
        <article className="recipe-timing-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          {card.helper ? <small>{card.helper}</small> : null}
        </article>
      ))}
    </div>
  );
}

function CultivationMetricCard({ card, status = false }: { card: TimingCard; status?: boolean }) {
  return (
    <article className="recipe-trough-metric">
      <span>{card.label}</span>
      {status ? <StatusPill value={card.value} /> : <strong>{card.value}</strong>}
      {card.helper ? <small>{card.helper}</small> : null}
    </article>
  );
}

function LightChannel({ light, dayStart }: { light: LightTiming; dayStart: number | null }) {
  const duration = durationSeconds(light.onDelay, light.offDelay);

  return (
    <div className="recipe-light-channel">
      <h5 className={light.color === "Red" ? "light-red" : "light-blue"}>{light.color}</h5>
      <div className="recipe-light-time-row">
        <span>On</span>
        <strong>{formatClock(dayStart, light.onDelay)}</strong>
      </div>
      <div className="recipe-light-time-row">
        <span>Off</span>
        <strong>{formatClock(dayStart, light.offDelay)}</strong>
      </div>
      <div className="recipe-light-footer">
        <span>{formatDuration(duration)}</span>
        <strong>PPFD {light.ppfd}</strong>
      </div>
    </div>
  );
}

function CultivationLightCard({
  title,
  red,
  blue,
  dayStart,
}: {
  title: string;
  red: LightTiming;
  blue: LightTiming;
  dayStart: number | null;
}) {
  const redDuration = durationSeconds(red.onDelay, red.offDelay);
  const blueDuration = durationSeconds(blue.onDelay, blue.offDelay);
  const totalDli = dliForLight(red.ppfd, redDuration) + dliForLight(blue.ppfd, blueDuration);
  const ratio = blue.ppfd > 0 ? (red.ppfd / blue.ppfd).toFixed(1).replace(/\.0$/, "") : "-";

  return (
    <section className="recipe-light-card">
      <div className="recipe-light-card-header">
        <h4>{title} Light</h4>
        <span>{sideCode(title.startsWith("Left") ? "left" : "right")}</span>
      </div>
      <div className="recipe-light-channel-grid">
        <LightChannel light={red} dayStart={dayStart} />
        <LightChannel light={blue} dayStart={dayStart} />
      </div>
      <div className="recipe-light-summary">
        <span>DLI <strong>{formatDli(totalDli)}</strong></span>
        <span>Red/Blue DLI Ratio <strong>{ratio}:1</strong></span>
      </div>
    </section>
  );
}

function CultivationLayoutMap({
  timing,
  lighting,
}: {
  timing: TimingCard[];
  lighting: CultivationLighting;
}) {
  return (
    <section className="cultivation-layout-map" aria-label="Cultivation row configuration">
      <div className="cultivation-layout-header">
        <div>
          <p className="zone-kicker">Grow row layout</p>
          <h3>Greenery S cultivation rows</h3>
        </div>
        <span>Dual-zone lighting and irrigation</span>
      </div>

      <div className="cultivation-row-grid">
        {CULTIVATION_ROWS.map((row) => {
          const cards = sideCards(row.side, timing);
          const redDuration = durationSeconds(lighting[row.side].red.onDelay, lighting[row.side].red.offDelay);
          const blueDuration = durationSeconds(lighting[row.side].blue.onDelay, lighting[row.side].blue.offDelay);
          return (
            <article className={`cultivation-row-card ${row.side}`} key={row.code}>
              <div className="cultivation-row-code">{row.code}</div>
              <div>
                <h4>{row.label}</h4>
                <p>{sideTitle(row.side)} settings</p>
              </div>
              <div className="cultivation-row-facts">
                <span>Irrigation <strong>{cards.waterLength.value}</strong></span>
                <span>Red <strong>{formatDuration(redDuration)}</strong></span>
                <span>Blue <strong>{formatDuration(blueDuration)}</strong></span>
              </div>
              <StatusPill value={cards.waterEnable.value} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CultivationLightingSection({ lighting, dayStart }: { lighting: CultivationLighting; dayStart: number | null }) {
  return (
    <div className="recipe-zone-subsection">
      <h3 className="recipe-subtitle">Lighting schedule</h3>
      <div className="recipe-trough-stack cultivation-side-stack">
        <CultivationLightCard
          title={sideTitle("left")}
          dayStart={dayStart}
          red={{ color: "Red", ...lighting.left.red }}
          blue={{ color: "Blue", ...lighting.left.blue }}
        />
        <CultivationLightCard
          title={sideTitle("right")}
          dayStart={dayStart}
          red={{ color: "Red", ...lighting.right.red }}
          blue={{ color: "Blue", ...lighting.right.blue }}
        />
      </div>
    </div>
  );
}

function CultivationIrrigationSection({ timing }: { timing: TimingCard[] }) {
  const left = sideCards("left", timing);
  const right = sideCards("right", timing);
  const waterCycle = findCard(timing, "Water cycle");
  const waterOffset = findCard(timing, "Water offset");
  const recirculation = findCard(timing, "Recirculation");

  return (
    <div className="recipe-zone-subsection">
      <h3 className="recipe-subtitle">Irrigation schedule</h3>
      <div className="recipe-trough-grid cultivation-schedule-grid">
        <CultivationMetricCard card={left.waterLength} />
        <CultivationMetricCard card={left.waterEnable} status />
        <CultivationMetricCard card={left.water24h} status />
        <CultivationMetricCard card={right.waterLength} />
        <CultivationMetricCard card={right.waterEnable} status />
        <CultivationMetricCard card={right.water24h} status />
        <CultivationMetricCard card={waterCycle} />
        <CultivationMetricCard card={waterOffset} />
        <CultivationMetricCard card={recirculation} status />
      </div>
    </div>
  );
}

function CultivationDosingSection({ timing, dosing }: { timing: TimingCard[]; dosing: TimingCard[] }) {
  const ecAutodose = findCard(timing, "EC autodose");
  const phAutodose = findCard(timing, "pH autodose");

  return (
    <div className="recipe-zone-subsection">
      <h3 className="recipe-subtitle">Dosing schedule</h3>
      <div className="recipe-trough-grid cultivation-dosing-grid">
        <CultivationMetricCard card={ecAutodose} status />
        <CultivationMetricCard card={phAutodose} status />
        {dosing.map((card) => (
          <CultivationMetricCard key={card.label} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function CultivationRecipeGroups({
  targets,
  timing,
  dosing,
  lighting,
  dayStart,
}: {
  targets: TargetCard[];
  timing: TimingCard[];
  dosing: TimingCard[];
  lighting: CultivationLighting;
  dayStart: number | null;
}) {
  return (
    <section className="recipe-panel recipe-zone-panel recipe-cultivation-panel">
      <div className="recipe-section-header">
        <p className="zone-kicker">Cultivation Zone</p>
        <h2>Cultivation recipe</h2>
        <p>Four grow rows with shared left-side and right-side lighting, irrigation, recirculation, and dosing settings.</p>
      </div>

      <ClimateMatrix cards={targets} />
      <CultivationLayoutMap timing={timing} lighting={lighting} />
      <CultivationLightingSection lighting={lighting} dayStart={dayStart} />
      <CultivationIrrigationSection timing={timing} />
      <CultivationDosingSection timing={timing} dosing={dosing} />
    </section>
  );
}
