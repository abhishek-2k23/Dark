import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";

import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";

export interface SwitchProps
  extends Omit<RNSwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor"> {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

/**
 * The platform Switch, dressed in theme colors so the "on" state reads as the
 * app's primary rather than the OS default green.
 */
export function Switch({ value, disabled, ...rest }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      trackColor={{
        false: colors.glassBorder,
        true: withAlpha(colors.primary, 0.6),
      }}
      thumbColor={value ? colors.primary : colors.surface}
      ios_backgroundColor={colors.glassBorder}
      style={disabled ? { opacity: 0.5 } : undefined}
      {...rest}
    />
  );
}
