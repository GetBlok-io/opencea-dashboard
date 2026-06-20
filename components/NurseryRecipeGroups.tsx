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

function findCard(cards: TimingCard[], label: string): TimingCard {
  return cards.find((card) => card.label === label) ?? { label, value: "—" };
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

function NurseryTroughGroup({
  title,
  waterLength,
  waterEnable,
  lights,
  common,
}: {
  title: string;
  waterLength: TimingCard;
  waterEnable: TimingCard;
  lights: TimingCard[];
  common: TimingCard[];
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

      <div className="recipe-trough-lighting">
        <h4>Lighting</h4>
        <div className="recipe-trough-grid recipe-trough-light-grid">
          {lights.map((light) => <TroughMetricCard key={light.label} card={light} />)}
        </div>
      </div>
    </section>
  );
}

export default function NurseryRecipeGroups({
  targets,
  timing,
  lighting,
}: {
  targets: TargetCard[];
  timing: TimingCard[];
  lighting: TimingCard[];
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
          lights={[findCard(lighting, "Top red"), findCard(lighting, "Top blue")]}
          common={common}
        />
        <NurseryTroughGroup
          title="Bottom Trough"
          waterLength={findCard(timing, "Bottom water length")}
          waterEnable={findCard(timing, "Bottom water")}
          lights={[findCard(lighting, "Bottom red"), findCard(lighting, "Bottom blue")]}
          common={common}
        />
      </div>
    </section>
  );
}
