import { View } from "react-native";

import { useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";
import { withAlpha } from "@/utils/color";
import { Icon, type IconName } from "./Icon";

export type IconCircleTone =
  | "primary"
  | "success"
  | "accent"
  | "warning"
  | "danger"
  | "peach"
  | "neutral";

/** Legacy tones re-pointed at the neon hue system. */
const TONE_HUE: Record<Exclude<IconCircleTone, "neutral">, NeonHue> = {
  primary: "blue",
  success: "green",
  accent: "cyan",
  warning: "gold",
  danger: "pink",
  peach: "gold",
};

export interface IconCircleProps {
  name: IconName;
  tone?: IconCircleTone;
  /** Neon accent hue; overrides `tone`. Use `hueFor(feature)` for consistency. */
  hue?: NeonHue;
  /** Diameter in dp. Icon glyph scales to ~52% of this. */
  size?: number;
  className?: string;
}

/**
 * A circular glass chip holding a neon-tinted icon — quick actions, list
 * leading art. Faint hue wash + hue hairline over the aurora backdrop.
 */
export function IconCircle({
  name,
  tone = "primary",
  hue,
  size = 48,
  className,
}: IconCircleProps) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";

  const resolvedHue = hue ?? (tone === "neutral" ? undefined : TONE_HUE[tone]);
  const accent = resolvedHue
    ? colors.neon[resolvedHue]
    : colors.contentSecondary;

  return (
    <View
      className={cn("items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        backgroundColor: withAlpha(accent, dark ? 0.1 : 0.12),
        borderColor: withAlpha(accent, dark ? 0.3 : 0.35),
      }}
    >
      <Icon name={name} size={Math.round(size * 0.52)} color={accent} />
    </View>
  );
}
