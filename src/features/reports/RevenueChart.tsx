/**
 * Dependency-free inline SVG area/line chart for "Revenue Over Time".
 * No chart libraries. Green line + soft green fill, day labels on the x-axis.
 */
import { useMemo } from "react";
import { formatMoney } from "@/lib/money";
import type { RevenuePoint } from "./reportsData";

interface Props {
  points: RevenuePoint[];
}

const WIDTH = 320;
const HEIGHT = 140;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

/** Short weekday-or-day label for the x-axis (parses yyyy-mm-dd as local). */
function axisLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-IN", { weekday: "short" });
}

export function RevenueChart({ points }: Props) {
  const geom = useMemo(() => {
    const n = points.length;
    if (n === 0) return null;

    const max = Math.max(1, ...points.map((p) => p.revenue));
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const x = (i: number) =>
      n === 1 ? WIDTH / 2 : PAD_X + (i / (n - 1)) * innerW;
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;

    const coords = points.map((p, i) => ({ px: x(i), py: y(p.revenue), p, i }));

    const line = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.px.toFixed(1)},${c.py.toFixed(1)}`)
      .join(" ");

    const baseY = PAD_TOP + innerH;
    const area =
      `${line} L${coords[coords.length - 1].px.toFixed(1)},${baseY} ` +
      `L${coords[0].px.toFixed(1)},${baseY} Z`;

    return { coords, line, area };
  }, [points]);

  if (!geom) {
    return (
      <div className="chart-empty">No revenue data for this period.</div>
    );
  }

  return (
    <svg
      className="revenue-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Revenue over time"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="revenue-chart__fill-top" />
          <stop offset="100%" className="revenue-chart__fill-bottom" />
        </linearGradient>
      </defs>
      <path className="revenue-chart__area" d={geom.area} fill="url(#revFill)" />
      <path className="revenue-chart__line" d={geom.line} />
      {geom.coords.map((c) => (
        <circle
          key={c.p.date}
          className="revenue-chart__dot"
          cx={c.px}
          cy={c.py}
          r={2.5}
        >
          <title>{`${c.p.date}: ${formatMoney(c.p.revenue)}`}</title>
        </circle>
      ))}
      {geom.coords.map((c) => (
        <text
          key={`lbl-${c.p.date}`}
          className="revenue-chart__label"
          x={c.px}
          y={HEIGHT - 6}
          textAnchor="middle"
        >
          {axisLabel(c.p.date)}
        </text>
      ))}
    </svg>
  );
}
