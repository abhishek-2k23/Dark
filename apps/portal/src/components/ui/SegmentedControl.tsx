import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { cn } from "@/utils/cn";
import { withAlpha } from "@/utils/color";
import { Text } from "./Text";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Equal-width segmented tabs (e.g. Today / Week / Month). Segments flex so the
 * control stays balanced as labels or font sizes change.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      className={cn("flex-row rounded-full p-1", className)}
      style={{
        backgroundColor: colors.glassFill,
        borderWidth: 1,
        borderColor: colors.glassBorder,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cn(
              "flex-1 items-center justify-center rounded-full px-3 py-2.5",
              !active && "active:opacity-70",
            )}
            style={
              active
                ? {
                    backgroundColor: withAlpha(colors.primary, 0.16),
                    borderWidth: 1,
                    borderColor: withAlpha(colors.primary, 0.4),
                  }
                : undefined
            }
          >
            <Text
              variant="subtitle"
              color={active ? "primary" : "secondary"}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
