import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon, Text } from "@/components/ui";
import type { PickSource, UploadKind } from "@/lib/upload";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { useImageUpload } from "./useImageUpload";

export interface ImageFieldProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  kind: UploadKind;
  label?: string;
  labelHint?: string;
  /** Empty-state helper line, e.g. "Shown at the top of the notice". */
  hint?: string;
  /** Width:height of the preview and the crop editor. Defaults to 3:1. */
  aspect?: [number, number];
  /** expo-image contentFit — "contain" suits logos, "cover" suits banners. */
  contentFit?: "cover" | "contain";
  forceSource?: PickSource;
  disabled?: boolean;
}

/**
 * One full-width image with a framed empty state — for banners, logos, and
 * receipts, where the picture is a single hero rather than one of many.
 */
export function ImageField({
  value,
  onChange,
  kind,
  label,
  labelHint,
  hint,
  aspect = [3, 1],
  contentFit = "cover",
  forceSource,
  disabled,
}: ImageFieldProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const { busy, start } = useImageUpload({
    kind,
    aspect,
    allowsEditing: true,
    forceSource,
    onUploaded: (urls) => onChange(urls[0] ?? null),
  });

  const ratio = aspect[0] / aspect[1];

  return (
    <View className="gap-2">
      {label && (
        <View className="flex-row items-center justify-between">
          <Text variant="subtitle" color="primary">
            {label}
          </Text>
          {labelHint && (
            <Text variant="caption" color="tertiary">
              {labelHint}
            </Text>
          )}
        </View>
      )}

      <Pressable
        onPress={start}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={t(value ? "media.changePhoto" : "media.addPhoto")}
        className="w-full overflow-hidden active:opacity-80"
        style={{
          aspectRatio: ratio,
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: value ? "solid" : "dashed",
          borderColor: value ? colors.border : colors.borderStrong,
          backgroundColor: value ? colors.surfaceMuted : withAlpha(colors.primary, 0.06),
        }}
      >
        {value && (
          <Image
            source={{ uri: value }}
            style={{ width: "100%", height: "100%" }}
            contentFit={contentFit}
            transition={150}
          />
        )}

        {!value && !busy && (
          <View className="flex-1 items-center justify-center gap-1">
            <Icon name="image-outline" size={26} color="primary" />
            <Text variant="subtitle" color="primary">
              {t("media.addPhoto")}
            </Text>
            {hint && (
              <Text variant="caption" color="tertiary" align="center">
                {hint}
              </Text>
            )}
          </View>
        )}

        {busy && (
          <View
            className="absolute inset-0 items-center justify-center"
            style={{ backgroundColor: withAlpha(colors.background, 0.6) }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </Pressable>

      {value && !disabled && !busy && (
        <View className="flex-row gap-4">
          <Pressable onPress={start} className="active:opacity-70">
            <Text variant="caption" color="primary">
              {t("media.changePhoto")}
            </Text>
          </Pressable>
          <Pressable onPress={() => onChange(null)} className="active:opacity-70">
            <Text variant="caption" color="danger">
              {t("media.remove")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
