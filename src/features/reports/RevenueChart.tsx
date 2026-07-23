/**
 * RevenueChart — an area/line chart of per-day revenue for the selected range,
 * drawn with react-native-svg (no web/DOM SVG). Green line with a soft green
 * gradient fill, matching the SADA theme. Data comes from `revenueSeries`.
 *
 * Tapping anywhere on the chart selects the nearest day and shows a tooltip
 * with that day's date and revenue. Works for both the week (7 points) and
 * month (30 points) ranges.
 */
import { useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { colors, fonts, radius, shadow, space } from "@/theme/theme";
import { formatMoney } from "@/lib/money";
import type { RevenuePoint } from "./reportsData";

interface RevenueChartProps {
  points: RevenuePoint[];
}

const HEIGHT = 160;
const PAD_TOP = space.s3;
const PAD_BOTTOM = space.s3;
const PAD_X = space.s2;
/** Wide enough for "Wed" on one line — narrower labels wrap and overlap. */
const LABEL_W = 36;
const TOOLTIP_W = 132;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parse a yyyy-mm-dd key as UTC (tz-safe under Hermes). */
function parseKey(dayKey: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** Weekday abbreviation from a yyyy-mm-dd key. */
function weekdayLabel(dayKey: string): string {
  const p = parseKey(dayKey);
  if (!p) return "";
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return WEEKDAYS[dow];
}

/** Tooltip date like "Tue, 21 Jul". */
function tooltipDate(dayKey: string): string {
  const p = parseKey(dayKey);
  if (!p) return dayKey;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${WEEKDAYS[dow]}, ${p.d} ${MONTHS[p.m - 1]}`;
}

export function RevenueChart({ points }: RevenueChartProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };

  const hasData = points.some((p) => p.revenue > 0);

  // Chart drawing area.
  const innerW = Math.max(width - PAD_X * 2, 1);
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));

  const n = points.length;
  const xFor = (i: number) =>
    PAD_X + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yFor = (revenue: number) =>
    PAD_TOP + innerH - (revenue / maxRevenue) * innerH;

  // Map a tap's x-coordinate to the nearest data point.
  const onChartPress = (e: GestureResponderEvent) => {
    if (n === 0 || width === 0) return;
    const x = e.nativeEvent.locationX;
    const i =
      n <= 1
        ? 0
        : Math.round(((x - PAD_X) / innerW) * (n - 1));
    const clamped = Math.min(Math.max(i, 0), n - 1);
    setSelected((prev) => (prev === clamped ? null : clamped));
  };

  // Keep any stale selection in bounds when the range (and n) changes.
  const sel =
    selected != null && selected < n ? selected : null;
  const selPoint = sel != null ? points[sel] : null;

  // Build the line and area paths.
  let linePath = "";
  let areaPath = "";
  if (width > 0 && n > 0) {
    points.forEach((p, i) => {
      const x = xFor(i);
      const y = yFor(p.revenue);
      linePath += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    });
    const baseline = PAD_TOP + innerH;
    areaPath =
      `M${xFor(0)},${baseline}` +
      points.map((p, i) => ` L${xFor(i)},${yFor(p.revenue)}`).join("") +
      ` L${xFor(n - 1)},${baseline} Z`;
  }

  // Label sampling: at most ~7 labels so a 30-day range stays legible.
  const maxLabels = 7;
  const step = Math.max(1, Math.ceil(n / maxLabels));

  // Centre each label on its point, but keep it inside the chart so the first
  // and last labels don't spill past the card edge.
  const clampLeft = (center: number, boxW: number) =>
    Math.min(Math.max(center - boxW / 2, 0), Math.max(width - boxW, 0));

  return (
    <View onLayout={onLayout}>
      <Pressable onPress={onChartPress}>
        <View style={styles.chartArea}>
          {width > 0 && (
            <Svg width={width} height={HEIGHT}>
              <Defs>
                <LinearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.primary} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
                </LinearGradient>
              </Defs>
              {hasData && <Path d={areaPath} fill="url(#revFill)" />}
              <Path
                d={linePath}
                stroke={colors.primary}
                strokeWidth={2.5}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {n <= 14 &&
                points.map((p, i) => (
                  <Circle
                    key={p.date}
                    cx={xFor(i)}
                    cy={yFor(p.revenue)}
                    r={2.5}
                    fill={colors.surface}
                    stroke={colors.primary}
                    strokeWidth={1.5}
                  />
                ))}
              {/* Selected-day marker: vertical guide + emphasised dot. */}
              {selPoint && (
                <>
                  <Line
                    x1={xFor(sel!)}
                    y1={PAD_TOP}
                    x2={xFor(sel!)}
                    y2={PAD_TOP + innerH}
                    stroke={colors.primary}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.4}
                  />
                  <Circle
                    cx={xFor(sel!)}
                    cy={yFor(selPoint.revenue)}
                    r={5}
                    fill={colors.primary}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                </>
              )}
            </Svg>
          )}
          {!hasData && width > 0 && (
            <View style={styles.emptyOverlay} pointerEvents="none">
              <Text style={styles.emptyText}>No revenue in this period</Text>
            </View>
          )}

          {/* Floating tooltip for the selected day. */}
          {selPoint && width > 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                {
                  left: clampLeft(xFor(sel!), TOOLTIP_W),
                  top: Math.max(yFor(selPoint.revenue) - 52, 0),
                },
              ]}
            >
              <Text style={styles.tooltipDate}>{tooltipDate(selPoint.date)}</Text>
              <Text style={styles.tooltipValue}>
                {formatMoney(selPoint.revenue)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* X-axis day labels */}
      <View style={styles.labelsRow}>
        {points.map((p, i) =>
          i % step === 0 || i === n - 1 ? (
            <Text
              key={p.date}
              numberOfLines={1}
              style={[styles.axisLabel, { left: clampLeft(xFor(i), LABEL_W) }]}
            >
              {weekdayLabel(p.date)}
            </Text>
          ) : null
        )}
      </View>

      {/* Peak-day caption (or a hint once the user has tapped a day). */}
      {hasData && (
        <Text style={styles.peakCaption}>
          {selPoint ? "Tap a day for its sales" : `Peak ${formatMoney(maxRevenue)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: {
    height: HEIGHT,
    justifyContent: "center",
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  tooltip: {
    position: "absolute",
    width: TOOLTIP_W,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    ...shadow.card,
  },
  tooltipDate: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.textMuted,
  },
  tooltipValue: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    marginTop: 1,
  },
  labelsRow: {
    height: 18,
    marginTop: space.s1,
    position: "relative",
  },
  axisLabel: {
    position: "absolute",
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    width: LABEL_W,
    textAlign: "center",
  },
  peakCaption: {
    marginTop: space.s2,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "right",
  },
});
