import { Pressable, View } from "react-native";

import { useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";
import { withAlpha } from "@/utils/color";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface NeonTileProps {
  name: IconName;
  /** Neon accent hue — use `hueFor(feature)` to stay consistent app-wide. */
  hue?: NeonHue;
  /** Label rendered under the tile. */
  label?: string;
  /** Tile edge length in dp. */
  size?: number;
  onPress?: () => void;
  className?: string;
}

/**
 * Squircle glass icon tile for quick-action grids (the 4-column layouts in
 * the reference design): dark glass chip, faint hue wash, thin luminous
 * border and a neon-stroke Ionicon, with an optional caption below.
 */
export function NeonTile({
  name,
  hue = "blue",
  label,
  size = 60,
  onPress,
  className,
}: NeonTileProps) {
  const { colors, scheme } = useTheme();
  const hueColor = colors.neon[hue];
  const dark = scheme === "dark";

  const tile = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: dark
          ? withAlpha(hueColor, 0.08)
          : withAlpha(hueColor, 0.1),
        borderColor: withAlpha(hueColor, dark ? 0.28 : 0.32),
      }}
      className="items-center justify-center"
    >
      <Icon name={name} size={Math.round(size * 0.44)} color={hueColor} />
    </View>
  );

  const content = (
    <>
      {tile}
      {label ? (
        <Text
          variant="caption"
          color="secondary"
          className="text-center"
          numberOfLines={2}
        >
          {label}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={cn("items-center gap-1.5 active:opacity-70", className)}
        style={({ pressed }) => [
          { width: size + 18 },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className={cn("items-center gap-1.5", className)}
      style={{ width: size + 18 }}
    >
      {content}
    </View>
  );
}
