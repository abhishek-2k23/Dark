import type { ReactNode } from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius as radiusTokens, useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";

export type GlassCardVariant = "glass" | "glassStrong" | "neon" | "hero";

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

export interface GlassCardProps {
  /**
   * `glass` — translucent fill + luminous hairline (the workhorse).
   * `glassStrong` — heavier fill for emphasized surfaces.
   * `neon` — brighter hairline for emphasis. No longer hue-tinted.
   * `hero` — brightest hairline over a near-opaque fill.
   */
  variant?: GlassCardVariant;
  /**
   * @deprecated Cards no longer tint themselves — their color comes from the
   * animated aurora backdrop showing through the translucent fill. Accepted so
   * existing call sites keep compiling; ignored. Tint the card's icon instead.
   */
  hue?: NeonHue;
  /** @deprecated Ignored — `hero` borders are neutral now. */
  gradientBorder?: [string, string, ...string[]];
  /** @deprecated Ignored — colored halos are gone; the backdrop is the color. */
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
 *
 * Cards are intentionally colorless: every variant is the same neutral glass,
 * differing only in how much fill and hairline they carry. The color you see in
 * a card is the animated aurora behind it, showing through the fill — which is
 * why the fills stay translucent even for the emphasized variants.
 */
export function GlassCard({
  variant = "glass",
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

  const heavyFill = variant === "glassStrong" || variant === "hero";
  const brightEdge = variant === "neon" || variant === "hero";

  const surface: ViewStyle = {
    borderRadius: r,
    borderWidth: 1,
    backgroundColor: heavyFill ? colors.glassFillStrong : colors.glassFill,
    borderColor: brightEdge ? colors.glassBorderStrong : colors.glassBorder,
  };

  const classes = cn(
    "overflow-hidden",
    PADDING[padding],
    onPress && "active:opacity-90",
    className,
  );
  const merged = [surface, style];

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
