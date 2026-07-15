import {
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/theme";
import { cn } from "@/utils/cn";

export type CardVariant = "elevated" | "outlined" | "filled" | "tonal";

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

/**
 * A rounded glass surface. The legacy variants are remapped onto the glass
 * language so every existing call site re-skins automatically:
 * elevated/outlined → translucent glass + hairline, filled → stronger glass,
 * tonal → soft primary wash. Pass `onPress` to make it tappable.
 * For neon/gradient borders reach for `GlassCard` instead.
 */
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
  const { colors } = useTheme();

  const surface: ViewStyle =
    variant === "tonal"
      ? {
          borderWidth: 1,
          backgroundColor: colors.primarySoft,
          borderColor: colors.glassBorder,
        }
      : {
          borderWidth: 1,
          backgroundColor:
            variant === "filled" ? colors.glassFillStrong : colors.glassFill,
          borderColor: colors.glassBorder,
        };

  const classes = cn(
    "overflow-hidden rounded-2xl",
    PADDING[padding],
    onPress && "active:opacity-90",
    className,
  );
  const mergedStyle = [surface, style];

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
