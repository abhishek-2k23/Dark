import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export interface GradientBorderProps {
  /** Border gradient stops, top-left → bottom-right. */
  colors: [string, string, ...string[]];
  /** Outer corner radius; the inner surface is inset by the border width. */
  radius: number;
  /** Border thickness. Keep at 1–1.5 for the neon hairline look. */
  width?: number;
  /**
   * Inner surface fill. Must be near-opaque or the gradient bleeds through
   * the whole card instead of reading as a border.
   */
  innerFill: string;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A 1px neon gradient border: LinearGradient shell with padding equal to the
 * border width and a near-opaque inner surface. No layout measurement needed —
 * works with intrinsic and dynamic content heights.
 */
export function GradientBorder({
  colors,
  radius,
  width = 1,
  innerFill,
  style,
  innerStyle,
  children,
}: GradientBorderProps) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, padding: width }, style]}
    >
      <View
        style={[
          {
            borderRadius: radius - width,
            backgroundColor: innerFill,
            overflow: "hidden",
          },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}
