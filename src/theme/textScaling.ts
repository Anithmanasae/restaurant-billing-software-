/**
 * App-wide cap on OS font scaling. Imported for its side effect from
 * `app/_layout.tsx`, before any screen renders.
 *
 * Android's Settings → Display → Font size (and Display size) multiplies every
 * `<Text>` by up to ~1.3× (2× with accessibility sizes on). This is a dense,
 * number-heavy POS on a 6" phone: at the client's raised setting the floor-grid
 * tiles' "₹9,486.00 3d 21h" row grew past its card and the two values collided
 * — invisible in development, where the test devices sit at 1.0×.
 *
 * Layouts here are built to absorb a moderate bump, not an unbounded one, so
 * the multiplier is clamped once here rather than by remembering
 * `maxFontSizeMultiplier` on hundreds of Text nodes. Text still scales for
 * legibility, just never past MAX_FONT_SCALE, and any node that genuinely
 * wants more can still pass its own prop (explicit props beat defaults).
 *
 * Mechanism: React resolves `type.defaultProps` inside the JSX runtime itself
 * (verified in both the dev and production builds of React 18.3), so this
 * reaches Text/TextInput rendered anywhere — including inside React Navigation
 * and other libraries we don't control. React 19 drops defaultProps for
 * function components: on that upgrade this must become an explicit shared
 * `<AppText>` wrapper (or an equivalent), or the cap silently stops applying.
 */
import { Text, TextInput } from "react-native";

/** Hard ceiling on the OS font multiplier. */
export const MAX_FONT_SCALE = 1.25;

type WithDefaultProps = { defaultProps?: Record<string, unknown> };

for (const Component of [Text, TextInput] as unknown as WithDefaultProps[]) {
  Component.defaultProps = {
    ...Component.defaultProps,
    maxFontSizeMultiplier: MAX_FONT_SCALE,
  };
}
