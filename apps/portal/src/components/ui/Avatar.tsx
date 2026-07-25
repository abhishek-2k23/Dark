import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

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

/**
 * Circular user image with an initials fallback and optional neon ring.
 *
 * The initials are always rendered, with the photo laid over them rather than
 * swapped in for them. A URL is not a picture: it may still be downloading, or
 * point at something deleted, expired or unreachable — and a lone `<Image>`
 * whose source fails draws nothing at all, leaving an empty disc where a face
 * should be. Keeping the initials underneath means the avatar is never blank,
 * and `onError` drops a broken photo so the fallback is what remains.
 */
export function Avatar({ uri, name, size = 40, ring, className }: AvatarProps) {
  const { colors } = useTheme();
  const radius = size / 2;
  const [failed, setFailed] = useState(false);

  // A different subject deserves a fresh attempt at loading.
  useEffect(() => setFailed(false), [uri]);

  const ringColor = ring
    ? colors.neon[typeof ring === "string" ? ring : "blue"]
    : undefined;
  const ringStyle = ringColor
    ? { borderWidth: 1.5, borderColor: withAlpha(ringColor, 0.7) }
    : undefined;

  return (
    <View
      className={cn("items-center justify-center overflow-hidden", className)}
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
        // The variant's fixed lineHeight survives the fontSize override, so at
        // large sizes the glyphs overflow their line box and clip at the top.
        // Both must scale together.
        style={{
          fontSize: Math.round(size * 0.38),
          lineHeight: Math.round(size * 0.48),
        }}
      >
        {initialsOf(name)}
      </Text>

      {uri && !failed && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
