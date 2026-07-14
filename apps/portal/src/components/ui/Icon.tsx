import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps } from "react";

import { useTheme, type ThemeColors } from "@/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

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
  | "onPrimary";

const TOKEN_MAP: Record<IconColor, keyof ThemeColors> = {
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
    color in TOKEN_MAP ? colors[TOKEN_MAP[color as IconColor]] : (color as string);
  return <Ionicons name={name} size={size} color={resolved} style={style} />;
}
