/**
 * Entrance motion: fades children in while sliding them up ~12px on mount.
 * Wrap the loaded content that replaces a skeleton so data "arrives" instead
 * of popping; also fires on first tab visit (tabs mount lazily).
 */
import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export function FadeSlideIn({
  children,
  style,
  delay = 0,
}: {
  children: ReactNode;
  /** Defaults to flex: 1 so lists keep their height. */
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        { flex: 1 },
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
