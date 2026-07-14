import { Pressable, type PressableProps } from "react-native";

import { fontFamily } from "@/theme";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";
import { Text, type TextColor } from "./Text";

export interface LinkProps extends Omit<PressableProps, "children"> {
  label: string;
  color?: TextColor;
  size?: "sm" | "md";
  underline?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  className?: string;
}

/** An inline, tappable text link. */
export function Link({
  label,
  color = "primary",
  size = "md",
  underline = false,
  leftIcon,
  rightIcon,
  className,
  ...rest
}: LinkProps) {
  const iconSize = size === "sm" ? 15 : 17;
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={6}
      className={cn(
        "flex-row items-center gap-1 active:opacity-60",
        className,
      )}
      {...rest}
    >
      {leftIcon && <Icon name={leftIcon} size={iconSize} color={color} />}
      <Text
        variant={size === "sm" ? "bodySmall" : "subtitle"}
        color={color}
        className={cn(underline && "underline")}
        style={{ fontFamily: fontFamily.bodyBold }}
      >
        {label}
      </Text>
      {rightIcon && <Icon name={rightIcon} size={iconSize} color={color} />}
    </Pressable>
  );
}
