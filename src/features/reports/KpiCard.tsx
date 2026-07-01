/**
 * A single KPI card: label, big value, and a delta pill vs. the previous
 * equivalent period (green up / red down / neutral).
 */
import type { Delta } from "./reportsData";

interface Props {
  label: string;
  value: string;
  delta: Delta;
  /** When true, an "up" direction is bad (e.g. voided items) → colored red. */
  invert?: boolean;
}

const ARROW: Record<Delta["direction"], string> = {
  up: "↗",
  down: "↘",
  neutral: "→",
};

export function KpiCard({ label, value, delta, invert = false }: Props) {
  // Positive-is-good by default; invert flips the sentiment for "bad" metrics.
  const good =
    delta.direction === "neutral"
      ? "neutral"
      : (delta.direction === "up") !== invert
        ? "good"
        : "bad";

  const magnitude = Math.abs(delta.percent);
  const sign = delta.percent > 0 ? "+" : delta.percent < 0 ? "−" : "";

  return (
    <div className="kpi-card">
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value">{value}</span>
      <span className={`kpi-pill kpi-pill--${good}`}>
        <span className="kpi-pill__arrow">{ARROW[delta.direction]}</span>
        {sign}
        {magnitude.toFixed(1)}%
      </span>
    </div>
  );
}
