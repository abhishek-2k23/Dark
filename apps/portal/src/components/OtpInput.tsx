import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Text } from "@/components/ui";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";

export interface OtpInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  /** Fires once when the last digit lands — submit without a second tap. */
  onFilled?: (code: string) => void;
}

/**
 * Segmented one-time-code entry: one box per digit, backed by a single hidden
 * TextInput so the OS keyboard, paste, and (on Android) SMS autofill all keep
 * working — the boxes are purely presentation.
 */
export function OtpInput({ value, onChange, length = 6, onFilled }: OtpInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length && value.length !== length) onFilled?.(clean);
  };

  // The box the next digit will land in (or the last one, once full).
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityLabel={`${length}-digit code`}
    >
      <View className="flex-row gap-2.5">
        {Array.from({ length }).map((_, i) => {
          const active = focused && i === activeIndex;
          return (
            <View
              key={i}
              className="h-14 flex-1 items-center justify-center"
              style={{
                maxWidth: 56,
                borderRadius: 12,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: withAlpha(colors.surface, 0.55),
              }}
            >
              <Text variant="h2">{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </View>

      {/* Invisible but real: focusing it opens the keyboard for the boxes. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus
        caretHidden
        style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
      />
    </Pressable>
  );
}
