import { Image } from "expo-image";
import { View } from "react-native";

import { cn } from "@/utils/cn";
import { Text } from "./Text";

export interface AvatarProps {
  /** Remote image URL. Falls back to initials when absent. */
  uri?: string | null;
  /** Used to derive initials for the fallback. */
  name?: string;
  size?: number;
  className?: string;
}

function initialsOf(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Circular user image with an initials fallback. */
export function Avatar({ uri, name, size = 40, className }: AvatarProps) {
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={150}
        className={className}
      />
    );
  }

  return (
    <View
      className={cn(
        "items-center justify-center bg-primary-soft",
        className,
      )}
      style={{ width: size, height: size, borderRadius: radius }}
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
