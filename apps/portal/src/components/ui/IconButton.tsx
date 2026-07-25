import { Pressable, type PressableProps } from "react-native";

import { useTheme } from "@/theme";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";

export interface IconButtonProps extends Omit<PressableProps, "children" | "style"> {
  name: IconName;
  /** Required: an icon alone tells a screen reader nothing. */
  accessibilityLabel: string;
  /** Diameter in dp. The glyph scales with it. */
  size?: number;
  className?: string;
}

/**
 * A round glass button holding a single icon — header actions and other places
 * where a label would crowd the row.
 *
 * Circular rather than the rounded-rectangle `Button`: at this size a squircle
 * reads as a cramped chip, and the round shape matches the back affordance it
 * usually sits opposite. `IconCircle` is the non-interactive sibling.
 */
export function IconButton({
  name,
  accessibilityLabel,
  size = 40,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={8}
      className={cn(
        "items-center justify-center rounded-full active:opacity-70",
        disabled && "opacity-50",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.glassFill,
        borderWidth: 1,
        borderColor: colors.glassBorder,
      }}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color="content" />
    </Pressable>
  );
}
