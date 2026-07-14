import { View } from "react-native";

import { cn } from "@/utils/cn";
import { Icon, type IconColor, type IconName } from "./Icon";

export type IconCircleTone =
  | "primary"
  | "success"
  | "accent"
  | "warning"
  | "danger"
  | "peach"
  | "neutral";

const TONE: Record<IconCircleTone, { bg: string; icon: IconColor }> = {
  primary: { bg: "bg-primary-soft", icon: "primary" },
  success: { bg: "bg-success-soft", icon: "success" },
  accent: { bg: "bg-accent/20", icon: "accent" },
  warning: { bg: "bg-warning-soft", icon: "warning" },
  danger: { bg: "bg-danger-soft", icon: "danger" },
  peach: { bg: "bg-peach", icon: "warning" },
  neutral: { bg: "bg-surface-muted", icon: "secondary" },
};

export interface IconCircleProps {
  name: IconName;
  tone?: IconCircleTone;
  /** Diameter in dp. Icon glyph scales to ~52% of this. */
  size?: number;
  className?: string;
}

/** A circular tinted chip holding an icon — quick actions, list leading art. */
export function IconCircle({
  name,
  tone = "primary",
  size = 48,
  className,
}: IconCircleProps) {
  const t = TONE[tone];
  return (
    <View
      className={cn("items-center justify-center", t.bg, className)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Icon name={name} size={Math.round(size * 0.52)} color={t.icon} />
    </View>
  );
}
