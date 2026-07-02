/**
 * SADA POS design tokens for React Native — the JS equivalent of the old
 * theme.css. Green primary, white cards on a light-gray canvas, rounded
 * corners. Screens: import from here, never hardcode colors/spacing.
 */
export const colors = {
  primary: "#0f7a5a", // SADA green (buttons, active nav, links)
  primaryDark: "#0b5c44",
  primarySoft: "#e5f4ee", // selected card / active nav background
  accentAmber: "#f5a623", // KDS "Start" / urgent
  danger: "#e5484d", // voids, negative deltas

  bg: "#f4f5f7", // app canvas
  surface: "#ffffff", // cards
  surfaceMuted: "#f0f1f3", // image placeholder, chips

  text: "#1a1a1a",
  textMuted: "#6b7280",
  textInverse: "#ffffff",

  border: "#e5e7eb",
  borderStrong: "#d1d5db",

  amberSoft: "#fdecc8",
  amberText: "#92600a",
} as const;

/** 4px spacing scale. */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
} as const;

/** Locale / currency. */
export const currency = {
  symbol: "₹",
  code: "INR",
} as const;
