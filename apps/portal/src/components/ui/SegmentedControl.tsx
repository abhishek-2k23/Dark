import { Pressable, View } from "react-native";

import { elevation } from "@/theme";
import { cn } from "@/utils/cn";
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
  return (
    <View
      className={cn(
        "flex-row rounded-[9px] bg-surface-muted p-1",
        className,
      )}
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
              "flex-1 items-center justify-center rounded-[7px] px-3 py-2.5",
              active ? "bg-surface" : "active:opacity-70",
            )}
            style={active ? elevation.sm : undefined}
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
