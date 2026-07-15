import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Icon, Text } from "./ui";

/** Inline header for pushed screens: back chevron + title (+ optional right slot). */
export function StackHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-3 py-3">
      <View className="flex-1 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
          style={{
            backgroundColor: colors.glassFill,
            borderWidth: 1,
            borderColor: colors.glassBorder,
          }}
        >
          <Icon name="arrow-back" size={22} color="content" />
        </Pressable>
        <Text variant="h3" numberOfLines={1} className="shrink">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
