import type { ReactNode } from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { glow, radius as radiusTokens, useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";
import { withAlpha } from "@/utils/color";
import { GradientBorder } from "./GradientBorder";

export type GlassCardVariant = "glass" | "glassStrong" | "neon" | "hero";

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

export interface GlassCardProps {
  /**
   * `glass` — translucent fill + white hairline (the workhorse).
   * `glassStrong` — heavier fill for emphasized surfaces.
   * `neon` — glass fill with a single-hue neon border.
   * `hero` — multi-hue gradient border over a near-opaque fill.
   */
  variant?: GlassCardVariant;
  /** Accent hue for `neon` borders / glows. Defaults to the brand blue. */
  hue?: NeonHue;
  /** Override the `hero` gradient stops. */
  gradientBorder?: [string, string, ...string[]];
  /** Colored halo shadow (visible on iOS; Android relies on borders). */
  withGlow?: boolean;
  padding?: keyof typeof PADDING;
  /** Corner radius token. Defaults to the 24px card radius. */
  radius?: keyof typeof radiusTokens;
  onPress?: PressableProps["onPress"];
  pressableProps?: Omit<PressableProps, "onPress" | "children">;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * The glassmorphic surface primitive. "Glass" here is a translucent fill over
 * the aurora backdrop plus a luminous hairline — deliberately no BlurView, so
 * a screen can hold a dozen cards at 60fps (blur is reserved for nav chrome).
 */
export function GlassCard({
  variant = "glass",
  hue = "blue",
  gradientBorder,
  withGlow = false,
  padding = "md",
  radius = "2xl",
  onPress,
  pressableProps,
  className,
  style,
  children,
}: GlassCardProps) {
  const { colors } = useTheme();
  const r = radiusTokens[radius];
  const hueColor = colors.neon[hue];

  const glowStyle = withGlow ? glow(hueColor, "md") : undefined;

  // Hero: gradient hairline wrapping a near-opaque surface.
  if (variant === "hero") {
    const stops: [string, string, ...string[]] = gradientBorder ?? [
      colors.neon.violet,
      colors.neon.blue,
      colors.neon.gold,
    ];
    const inner = (
      <View className={cn(PADDING[padding], className)}>{children}</View>
    );
    return (
      <GradientBorder
        colors={stops}
        radius={r}
        innerFill={colors.glassHeavy}
        style={[glowStyle, style]}
      >
        {onPress ? (
          <Pressable
            onPress={onPress}
            className="active:opacity-90"
            {...pressableProps}
          >
            {inner}
          </Pressable>
        ) : (
          inner
        )}
      </GradientBorder>
    );
  }

  const surface: ViewStyle = {
    borderRadius: r,
    borderWidth: 1,
    backgroundColor:
      variant === "glassStrong" ? colors.glassFillStrong : colors.glassFill,
    borderColor:
      variant === "neon" ? withAlpha(hueColor, 0.45) : colors.glassBorder,
  };

  const classes = cn(
    "overflow-hidden",
    PADDING[padding],
    onPress && "active:opacity-90",
    className,
  );
  const merged = [surface, glowStyle, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={classes}
        style={({ pressed }) => [
          ...merged,
          pressed && { transform: [{ scale: 0.98 }] },
        ]}
        {...pressableProps}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View className={classes} style={merged}>
      {children}
    </View>
  );
}
