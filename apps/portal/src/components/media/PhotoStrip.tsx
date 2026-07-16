import { Image } from "expo-image";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { Icon, Text } from "@/components/ui";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";

export interface PhotoStripProps {
  urls: string[];
  label?: string;
  /** Thumbnail edge length. */
  size?: number;
}

/**
 * Read-only thumbnails that open a full-screen viewer on tap. Detail screens
 * are cramped, and a complaint photo is evidence — it has to be openable at
 * full size to be worth attaching in the first place.
 */
export function PhotoStrip({ urls, label, size = 84 }: PhotoStripProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (urls.length === 0) return null;

  return (
    <View className="gap-2">
      {label && (
        <Text variant="subtitle" color="primary">
          {label}
        </Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {urls.map((url, i) => (
          <Pressable
            key={url}
            onPress={() => setOpenAt(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={t("media.viewPhoto")}
            className="active:opacity-80"
          >
            <Image
              source={{ uri: url }}
              style={{ width: size, height: size, borderRadius: 10 }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={openAt !== null}
        transparent
        animationType="fade"
        // Android's hardware back must close the viewer, not the screen behind it.
        onRequestClose={() => setOpenAt(null)}
      >
        <View className="flex-1" style={{ backgroundColor: withAlpha("#000000", 0.94) }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (openAt ?? 0) * width, y: 0 }}
          >
            {urls.map((url) => (
              <View key={url} style={{ width, height }} className="items-center justify-center">
                <Image
                  source={{ uri: url }}
                  style={{ width, height: height * 0.8 }}
                  contentFit="contain"
                  transition={150}
                />
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => setOpenAt(null)}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            hitSlop={12}
            className="absolute items-center justify-center active:opacity-70"
            style={{
              top: 48,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: withAlpha(colors.background, 0.7),
            }}
          >
            <Icon name="close" size={22} color="content" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
