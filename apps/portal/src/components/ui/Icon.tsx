import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps } from "react";

import { useTheme, type NeonHue, type ThemeColors } from "@/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Theme color keys that resolve to plain color strings. */
type StringColorKey = {
  [K in keyof ThemeColors]: ThemeColors[K] extends string ? K : never;
}[keyof ThemeColors];

/** Semantic icon colors resolved from the active theme. */
export type IconColor =
  | "content"
  | "secondary"
  | "tertiary"
  | "inverse"
  | "primary"
  | "primaryStrong"
  | "success"
  | "danger"
  | "warning"
  | "accent"
  | "onPrimary"
  | "neonBlue"
  | "neonViolet"
  | "neonGold"
  | "neonGreen"
  | "neonPink"
  | "neonCyan";

const TOKEN_MAP: Record<Exclude<IconColor, `neon${string}`>, StringColorKey> = {
  content: "content",
  secondary: "contentSecondary",
  tertiary: "contentTertiary",
  inverse: "contentInverse",
  primary: "primary",
  primaryStrong: "primaryStrong",
  success: "success",
  danger: "danger",
  warning: "warning",
  accent: "accentStrong",
  onPrimary: "onPrimary",
};

const NEON_MAP: Record<Extract<IconColor, `neon${string}`>, NeonHue> = {
  neonBlue: "blue",
  neonViolet: "violet",
  neonGold: "gold",
  neonGreen: "green",
  neonPink: "pink",
  neonCyan: "cyan",
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Semantic token, or any raw color string. */
  color?: IconColor | (string & {});
  style?: ComponentProps<typeof Ionicons>["style"];
}

export function Icon({ name, size = 22, color = "content", style }: IconProps) {
  const { colors } = useTheme();
  const resolved =
    color in NEON_MAP
      ? colors.neon[NEON_MAP[color as keyof typeof NEON_MAP]]
      : color in TOKEN_MAP
        ? colors[TOKEN_MAP[color as keyof typeof TOKEN_MAP]]
        : (color as string);
  return <Ionicons name={name} size={size} color={resolved} style={style} />;
}
