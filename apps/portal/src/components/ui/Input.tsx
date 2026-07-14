import { useState, type ReactNode } from "react";
import {
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import {
  fontFamily,
  MAX_FONT_SCALE,
  typography,
  useTheme,
} from "@/theme";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface InputProps extends TextInputProps {
  label?: string;
  /** Right-aligned trailing label, e.g. "Optional". */
  labelHint?: string;
  leftIcon?: IconName;
  /** Custom trailing content (a toggle, a button…). */
  rightSlot?: ReactNode;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

/** Labelled text field with focus + error states. */
export function Input({
  label,
  labelHint,
  leftIcon,
  rightSlot,
  error,
  helperText,
  containerClassName,
  editable = true,
  onFocus,
  onBlur,
  style,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderClass = error
    ? "border-danger"
    : focused
      ? "border-primary"
      : "border-border";

  return (
    <View className={cn("gap-1.5", containerClassName)}>
      {label && (
        <View className="flex-row items-center justify-between">
          <Text variant="subtitle" color="primary">
            {label}
          </Text>
          {labelHint && (
            <Text variant="overline" color="tertiary">
              {labelHint}
            </Text>
          )}
        </View>
      )}

      <View
        className={cn(
          "flex-row items-center gap-2.5 rounded-[14px] border bg-surface-muted px-3.5",
          borderClass,
          !editable && "opacity-60",
        )}
      >
        {leftIcon && (
          <Icon name={leftIcon} size={20} color={focused ? "primary" : "tertiary"} />
        )}
        <TextInput
          editable={editable}
          placeholderTextColor={colors.contentTertiary}
          selectionColor={colors.primary}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: 14,
              fontFamily: fontFamily.body,
              fontSize: typography.body.fontSize,
              color: colors.content,
            },
            style,
          ]}
          {...rest}
        />
        {rightSlot}
      </View>

      {(error || helperText) && (
        <Text variant="caption" color={error ? "danger" : "secondary"}>
          {error ?? helperText}
        </Text>
      )}
    </View>
  );
}
