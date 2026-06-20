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

type NurseryLighting = {
  top: LightPair;
  bottom: LightPair;
};

function findCard(cards: TimingCard[], label: string): TimingCard {
  return cards.find((card) => card.label === label) ?? { label, value: "—" };
}

function formatClock(dayStart: number | null, delay: number | null) {
  if (dayStart === null || delay === null) return "—";
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
  if (seconds === null) return "—";
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

function StatusPill({ value }: { value: string }) {
  const normalized = value.trim().toLowerCase();
  const enabled = normalized === "enabled" || normalized === "on" || normalized === "active";
  const unknown = value === "—";

  return (
    <span className={unknown ? "recipe-status-pill unknown" : enabled ? "recipe-status-pill enabled" : "recipe-status-pill disabled"}>
      <span className="recipe-status-dot" />
      {value}
    </span>
  );
}

function ClimateMatrix({ cards }: { cards: TargetCard[] }) {
  return (
    <div className="recipe-climate-matrix" role="table" aria-label="Nursery day and night recipe targets">
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

function TroughMetricCard({ card, status = false }: { card: TimingCard; status?: boolean }) {
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

function NurseryLightCard({
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
  const ratio = blue.ppfd > 0 ? (red.ppfd / blue.ppfd).toFixed(1).replace(/\.0$/, "") : "—";

  return (
    <section className="recipe-light-card">
      <div className="recipe-light-card-header">
        <h4>{title} Light</h4>
        <span>Day Only</span>
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

function NurseryTroughGroup({
  title,
  waterLength,
  waterEnable,
  lightPair,
  common,
  dayStart,
}: {
  title: string;
  waterLength: TimingCard;
  waterEnable: TimingCard;
  lightPair: LightPair;
  common: TimingCard[];
  dayStart: number | null;
}) {
  return (
    <section className="recipe-trough-group">
      <div className="recipe-trough-header">
        <p className="zone-kicker">{title}</p>
        <h3>{title}</h3>
      </div>

      <div className="recipe-trough-grid">
        <TroughMetricCard card={common[0]} />
        <TroughMetricCard card={waterLength} />
        <TroughMetricCard card={waterEnable} status />
        <TroughMetricCard card={common[1]} status />
        <TroughMetricCard card={common[2]} status />
        <TroughMetricCard card={common[3]} status />
      </div>

      <NurseryLightCard
        title={title.replace(" Trough", "")}
        dayStart={dayStart}
        red={{ color: "Red", ...lightPair.red }}
        blue={{ color: "Blue", ...lightPair.blue }}
      />
    </section>
  );
}

export default function NurseryRecipeGroups({
  targets,
  timing,
  lighting,
  dayStart,
}: {
  targets: TargetCard[];
  timing: TimingCard[];
  lighting: NurseryLighting;
  dayStart: number | null;
}) {
  const common = [
    findCard(timing, "Water cycle"),
    findCard(timing, "Recirculation"),
    findCard(timing, "EC autodose"),
    findCard(timing, "pH autodose"),
  ];

  return (
    <section className="recipe-panel recipe-zone-panel recipe-nursery-panel">
      <div className="recipe-section-header">
        <p className="zone-kicker">Nursery Zone</p>
        <h2>Nursery recipe</h2>
        <p>Nursery chemistry and top/bottom trough watering, lighting, recirculation, and dosing status.</p>
      </div>

      <ClimateMatrix cards={targets} />

      <div className="recipe-trough-stack">
        <NurseryTroughGroup
          title="Top Trough"
          waterLength={findCard(timing, "Top water length")}
          waterEnable={findCard(timing, "Top water")}
          lightPair={lighting.top}
          common={common}
          dayStart={dayStart}
        />
        <NurseryTroughGroup
          title="Bottom Trough"
          waterLength={findCard(timing, "Bottom water length")}
          waterEnable={findCard(timing, "Bottom water")}
          lightPair={lighting.bottom}
          common={common}
          dayStart={dayStart}
        />
      </div>
    </section>
  );
}
