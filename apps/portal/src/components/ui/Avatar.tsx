import { Image } from "expo-image";
import { View } from "react-native";

import { useTheme, type NeonHue } from "@/theme";
import { cn } from "@/utils/cn";
import { withAlpha } from "@/utils/color";
import { Text } from "./Text";

export interface AvatarProps {
  /** Remote image URL. Falls back to initials when absent. */
  uri?: string | null;
  /** Used to derive initials for the fallback. */
  name?: string;
  size?: number;
  /** Thin neon ring around the avatar (pass a hue, defaults to blue). */
  ring?: boolean | NeonHue;
  className?: string;
}

function initialsOf(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Circular user image with an initials fallback and optional neon ring. */
export function Avatar({ uri, name, size = 40, ring, className }: AvatarProps) {
  const { colors } = useTheme();
  const radius = size / 2;

  const ringColor = ring
    ? colors.neon[typeof ring === "string" ? ring : "blue"]
    : undefined;
  const ringStyle = ringColor
    ? { borderWidth: 1.5, borderColor: withAlpha(ringColor, 0.7) }
    : undefined;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, ...ringStyle }}
        contentFit="cover"
        transition={150}
        className={className}
      />
    );
  }

  return (
    <View
      className={cn("items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: withAlpha(colors.primary, 0.14),
        ...(ringStyle ?? {
          borderWidth: 1,
          borderColor: withAlpha(colors.primary, 0.35),
        }),
      }}
    >
      <Text
        variant="subtitle"
        color="primary"
        style={{ fontSize: Math.round(size * 0.38) }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
