import { Pressable, View } from "react-native";

import { useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";
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
 * Squircle glass icon tile for quick-action grids (the 4-column "Quick
 * Access" layouts in the reference design): neutral dark glass chip with a
 * thin luminous hairline — the neon-stroke Ionicon is the only colored
 * element — and an optional caption below.
 */
export function NeonTile({
  name,
  hue = "blue",
  label,
  size = 64,
  onPress,
  className,
}: NeonTileProps) {
  const { colors } = useTheme();
  const hueColor = colors.neon[hue];

  const tile = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: colors.glassFill,
        borderColor: colors.glassBorder,
      }}
      className="items-center justify-center"
    >
      <Icon name={name} size={Math.round(size * 0.42)} color={hueColor} />
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
