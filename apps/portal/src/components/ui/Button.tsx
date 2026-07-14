import { ActivityIndicator, Pressable, type PressableProps } from "react-native";

import { useTheme } from "@/theme";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";
import { Text, type TextColor } from "./Text";

export type ButtonVariant =
  | "primary"
  | "success"
  | "secondary"
  | "outline"
  | "danger"
  | "dangerSoft"
  | "ghost";

export type ButtonSize = "sm" | "md" | "lg";

interface VariantStyle {
  /** Base + `active:` pressed treatment (NativeWind targets Pressable state). */
  container: string;
  fg: TextColor;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { container: "bg-primary-strong active:opacity-90", fg: "onPrimary" },
  success: { container: "bg-success active:opacity-90", fg: "onPrimary" },
  secondary: {
    container: "bg-primary-soft active:opacity-80",
    fg: "primary",
  },
  outline: {
    container:
      "bg-transparent border border-border-strong active:bg-surface-muted",
    fg: "primary",
  },
  danger: {
    container: "bg-transparent border border-danger active:bg-danger-soft",
    fg: "danger",
  },
  dangerSoft: {
    container: "bg-danger-soft active:opacity-80",
    fg: "danger",
  },
  ghost: { container: "bg-transparent active:bg-surface-muted", fg: "primary" },
};

const SIZES: Record<
  ButtonSize,
  { pad: string; text: "button" | "subtitle"; icon: number; gap: string }
> = {
  sm: { pad: "px-4 py-2.5", text: "subtitle", icon: 18, gap: "gap-1.5" },
  md: { pad: "px-5 py-3.5", text: "button", icon: 20, gap: "gap-2" },
  lg: { pad: "px-6 py-4", text: "button", icon: 22, gap: "gap-2.5" },
};

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: IconName;
  rightIcon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const spinnerColor =
    v.fg === "onPrimary"
      ? colors.onPrimary
      : v.fg === "danger"
        ? colors.danger
        : colors.primary;

  const handlePress: PressableProps["onPress"] = (e) => {
    if (__DEV__) console.log(`[Button] "${label}" pressed`);
    onPress?.(e);
  };

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      className={cn(
        "flex-row items-center justify-center rounded-[14px]",
        s.pad,
        s.gap,
        v.container,
        fullWidth && "w-full self-stretch",
        isDisabled && "opacity-50",
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        leftIcon && <Icon name={leftIcon} size={s.icon} color={v.fg} />
      )}
      <Text variant={s.text} color={v.fg} numberOfLines={1} className="shrink">
        {label}
      </Text>
      {!loading && rightIcon && (
        <Icon name={rightIcon} size={s.icon} color={v.fg} />
      )}
    </Pressable>
  );
}
