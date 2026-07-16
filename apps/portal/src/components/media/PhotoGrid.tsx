import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon, Text } from "@/components/ui";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import type { UploadKind } from "@/lib/upload";
import type { PickSource } from "@/lib/upload";
import { useImageUpload } from "./useImageUpload";

export interface PhotoGridProps {
  value: string[];
  onChange: (urls: string[]) => void;
  kind: UploadKind;
  label?: string;
  labelHint?: string;
  /** Hard cap; the add tile hides once reached. */
  max?: number;
  forceSource?: PickSource;
  disabled?: boolean;
}

const TILE = 96;

/**
 * Thumbnail grid with an add tile and per-thumbnail delete. Used wherever a
 * record holds several images (complaint photos, amenity gallery).
 */
export function PhotoGrid({
  value,
  onChange,
  kind,
  label,
  labelHint,
  max = 5,
  forceSource,
  disabled,
}: PhotoGridProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const remaining = Math.max(0, max - value.length);

  const { busy, start } = useImageUpload({
    kind,
    forceSource,
    allowsEditing: false,
    // Never let the picker return more than the remaining slots, so we don't
    // have to silently drop uploads the user already waited for.
    selectionLimit: remaining,
    onUploaded: (urls) => onChange([...value, ...urls].slice(0, max)),
  });

  const canAdd = remaining > 0 && !disabled;

  return (
    <View className="gap-2">
      {label && (
        <View className="flex-row items-center justify-between">
          <Text variant="subtitle" color="primary">
            {label}
          </Text>
          <Text variant="caption" color="tertiary">
            {labelHint ?? t("media.countOfMax", { current: value.length, max })}
          </Text>
        </View>
      )}

      <View className="flex-row flex-wrap gap-2">
        {value.map((url) => (
          <View key={url} style={{ width: TILE, height: TILE }}>
            <Image
              source={{ uri: url }}
              style={{ width: TILE, height: TILE, borderRadius: 10 }}
              contentFit="cover"
              transition={150}
            />
            {!disabled && (
              <Pressable
                onPress={() => onChange(value.filter((u) => u !== url))}
                accessibilityRole="button"
                accessibilityLabel={t("media.remove")}
                // Generous hit slop: the tile corner is a small target and a
                // mis-tap here deletes someone's photo.
                hitSlop={8}
                className="absolute items-center justify-center active:opacity-80"
                style={{
                  top: -6,
                  right: -6,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.danger,
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              >
                <Icon name="close" size={12} color="onPrimary" />
              </Pressable>
            )}
          </View>
        ))}

        {canAdd && (
          <Pressable
            onPress={start}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("media.addPhoto")}
            className="items-center justify-center active:opacity-80"
            style={{
              width: TILE,
              height: TILE,
              borderRadius: 10,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.borderStrong,
              backgroundColor: withAlpha(colors.primary, 0.06),
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Icon name="camera-outline" size={22} color="primary" />
                <Text variant="caption" color="primary">
                  {t("media.add")}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
