/**
 * SADA POS design tokens for React Native — the JS equivalent of the old
 * theme.css. Navy primary, white cards on a light-gray canvas, rounded
 * corners. Screens: import from here, never hardcode colors/spacing.
 */
export const colors = {
  primary: "#0047A1", // SADA navy (buttons, active nav, links)
  primaryDark: "#00336F",
  primarySoft: "#e6eefb", // selected card / active nav background
  accentBlue: "#1565C0", // KDS "Start" / urgent
  // Darkened from #e5484d, which fell to 3.6:1 on the canvas — below WCAG AA.
  // Error text is the copy users most need to read, and this doubles as the
  // background of destructive buttons, so it has to clear 4.5:1 both ways.
  danger: "#c73f43", // voids, negative deltas

  bg: "#f4f5f7", // app canvas
  floor: "#f8f9fa", // Tables floor canvas + image placeholders (soft grid backdrop)
  surface: "#ffffff", // cards
  surfaceMuted: "#f0f1f3", // image placeholder, chips
  searchBg: "#f1f3f5", // pill search field (very light gray, borderless)
  inputBorder: "#e2e8f0", // subtle input hairline (premium notes field)

  text: "#1a1a1a",
  // Darkened from #6b7280 (4.43:1 on the canvas — a hair under AA). Carries
  // every subtitle, timestamp and field label in the app, often read at arm's
  // length under harsh restaurant lighting.
  textMuted: "#686f7c",
  textInverse: "#ffffff",

  border: "#e5e7eb",
  borderStrong: "#d1d5db",

  scrim: "rgba(0,0,0,0.35)", // dim behind every modal / bottom sheet

  navySoft: "#e2ebfa",
  navyText: "#0047A1",

  // Status pills on the floor grid (soft tint + darker legible text).
  mintSoft: "#e3f6ec", // Free
  mintText: "#0f7a4f",
  indigoSoft: "#e6e8fb", // Billed
  indigoText: "#3538cd",

  // KDS status system: red = active first-round order, indigo = table has an
  // additional round, green = completed.
  statusRed: "#cd2e2e", // darkened from #D32F2F for AA on statusRedSoft
  statusRedSoft: "#fdeceb",
  statusIndigo: "#3538CD",
  statusIndigoSoft: "#e9eafc",
  statusGreen: "#2E7D32",
  statusGreenSoft: "#e4f5ec",
  statusBlue: "#1565C0", // takeaway/counter orders
  statusBlueSoft: "#e7f0fb",
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
  xl: 20,
  xxl: 24,
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
  // Soft, highly-blurred depth for floating white cards on the floor grid.
  float: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  // Colored "glow" for the floating primary CTA (navy at ~20% opacity).
  glow: {
    shadowColor: "#0047A1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/**
 * Plus Jakarta Sans — geometric sans-serif for a premium, rounded feel.
 * Loaded once in the root layout; reference these family names in styles.
 */
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

/**
 * Semantic type scale. Plus Jakarta Sans ships as five *separate* families, so
 * weight must be selected via `fontFamily` — a bare `fontWeight` silently falls
 * back to the system face. Always spread one of these instead of hand-rolling
 * a size/weight pair, so headers stay the same size on every screen.
 */
export const typography = {
  /** Big screen header ("Tables", "Bills", "Account"). Negative tracking
   *  keeps the extrabold face from looking loose at display size. */
  screenTitle: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: -0.4 },
  /** Sub-line under a screen title. */
  screenSubtitle: { fontFamily: fonts.regular, fontSize: 14 },
  /** Title inside a modal / bottom sheet. */
  sheetTitle: { fontFamily: fonts.extrabold, fontSize: 19 },
  /** Header of a card or grouped section. */
  cardTitle: { fontFamily: fonts.bold, fontSize: 16 },
  /** Small uppercase group label above a list ("PENDING REQUESTS", "TEAM").
   *  Not for content headings like a menu category name. */
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  /** Default running text. */
  body: { fontFamily: fonts.regular, fontSize: 15 },
  /** Running text that needs emphasis (values, names). */
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  /** Field labels, captions, timestamps. */
  caption: { fontFamily: fonts.regular, fontSize: 13 },
  /** Button / CTA text. */
  button: { fontFamily: fonts.bold, fontSize: 16 },
} as const;

/**
 * Interaction states. These were hand-picked per screen and had drifted to
 * five different disabled values (0.4 → 0.6), so the same "unavailable" button
 * looked differently unavailable depending on where you met it.
 */
export const opacity = {
  /** Held down. */
  pressed: 0.7,
  /** Not actionable yet. Low enough to read as off, high enough to stay legible. */
  disabled: 0.45,
} as const;

/** Locale / currency. */
export const currency = {
  symbol: "₹",
  code: "INR",
} as const;
