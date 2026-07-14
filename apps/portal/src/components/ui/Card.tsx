import {
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { elevation as elevationTokens, type ElevationToken } from "@/theme";
import { cn } from "@/utils/cn";

export type CardVariant = "elevated" | "outlined" | "filled" | "tonal";

const VARIANTS: Record<
  CardVariant,
  { className: string; elevation: ElevationToken }
> = {
  elevated: { className: "bg-surface", elevation: "md" },
  outlined: { className: "bg-surface border border-border", elevation: "none" },
  filled: { className: "bg-surface-muted", elevation: "none" },
  // tonal defaults to a soft primary wash; override bg via className for others.
  tonal: { className: "bg-primary-soft", elevation: "none" },
};

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

type Padding = keyof typeof PADDING;

interface BaseProps {
  variant?: CardVariant;
  padding?: Padding;
  className?: string;
}

export interface CardProps extends BaseProps, Omit<ViewProps, "className"> {
  /** Provide to make the whole card pressable. */
  onPress?: PressableProps["onPress"];
  pressableProps?: Omit<PressableProps, "onPress" | "children" | "className">;
}

/** A rounded surface. Pass `onPress` to make it tappable. */
export function Card({
  variant = "elevated",
  padding = "md",
  onPress,
  pressableProps,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const v = VARIANTS[variant];
  const classes = cn(
    "rounded-2xl",
    v.className,
    PADDING[padding],
    onPress && "active:opacity-90",
    className,
  );
  const mergedStyle = [elevationTokens[v.elevation], style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={classes}
        style={mergedStyle}
        {...pressableProps}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View className={classes} style={mergedStyle} {...rest}>
      {children}
    </View>
  );
}
