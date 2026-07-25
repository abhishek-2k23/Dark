import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { IconButton, Text } from "./ui";

/** Inline header for pushed screens: back chevron + title (+ optional right slot). */
export function StackHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between gap-3 py-3">
      <View className="flex-1 flex-row items-center gap-3">
        <IconButton
          name="arrow-back"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
        <Text variant="h3" numberOfLines={1} className="shrink">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
