import { View } from "react-native";

import { fontFamily, useTheme, type ThemeColors } from "@/theme";
import { cn } from "@/utils/cn";
import { Text, type TextColor } from "./Text";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "mint";

/** Theme color keys that resolve to plain color strings. */
type StringColorKey = {
  [K in keyof ThemeColors]: ThemeColors[K] extends string ? K : never;
}[keyof ThemeColors];

const TONES: Record<
  BadgeTone,
  { bg: string; fg: TextColor; dot: StringColorKey }
> = {
  neutral: { bg: "bg-surface-muted", fg: "secondary", dot: "contentSecondary" },
  primary: { bg: "bg-primary-soft", fg: "primary", dot: "primary" },
  success: { bg: "bg-success-soft", fg: "success", dot: "success" },
  warning: { bg: "bg-warning-soft", fg: "warning", dot: "warning" },
  danger: { bg: "bg-danger-soft", fg: "danger", dot: "danger" },
  mint: { bg: "bg-accent/20", fg: "accent", dot: "accentStrong" },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Leading status dot. */
  dot?: boolean;
  /** Uppercase + wider tracking (status-chip look). */
  uppercase?: boolean;
  className?: string;
}

export function Badge({
  label,
  tone = "neutral",
  size = "md",
  dot = false,
  uppercase = false,
  className,
}: BadgeProps) {
  const { colors } = useTheme();
  const t = TONES[tone];
  const pad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const dotSize = size === "sm" ? 5 : 6;

  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full",
        pad,
        t.bg,
        className,
      )}
    >
      {dot && (
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colors[t.dot],
          }}
        />
      )}
      <Text
        variant={uppercase ? "overline" : "caption"}
        color={t.fg}
        style={uppercase ? undefined : { fontFamily: fontFamily.bodyBold }}
      >
        {label}
      </Text>
    </View>
  );
}
