import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Avatar, Icon, Text } from "@/components/ui";
import type { PickSource, UploadKind } from "@/lib/upload";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { useImageUpload } from "./useImageUpload";

export interface AvatarPickerProps {
  /** Current avatar URL, or null when unset. */
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Drives the initials fallback. */
  name?: string;
  size?: number;
  /** Hint shown under the avatar. */
  label?: string;
  /** AVATAR by default; VISITOR files a guard's gate photo in its own folder. */
  kind?: UploadKind;
  /** Locks the picker to one source — "camera" for a live gate photo. */
  forceSource?: PickSource;
  disabled?: boolean;
}

/**
 * Tap-to-change circular photo with a camera badge. Square crop is forced in
 * the editor because both the AVATAR and VISITOR presets face-crop to a square
 * anyway — letting someone frame a landscape shot only to have it cut is a
 * worse experience than constraining the editor up front.
 */
export function AvatarPicker({
  value,
  onChange,
  name,
  size = 96,
  label,
  kind = "AVATAR",
  forceSource,
  disabled,
}: AvatarPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const { busy, start } = useImageUpload({
    kind,
    aspect: [1, 1],
    allowsEditing: true,
    forceSource,
    onUploaded: (urls) => onChange(urls[0] ?? null),
  });

  const badge = Math.round(size * 0.32);

  return (
    <View className="items-center gap-2">
      <Pressable
        onPress={start}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={t(value ? "media.changePhoto" : "media.addPhoto")}
        className="active:opacity-80"
      >
        <Avatar uri={value} name={name} size={size} ring />

        {busy && (
          <View
            className="absolute items-center justify-center"
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: withAlpha(colors.background, 0.6),
            }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {!busy && (
          <View
            className="absolute items-center justify-center"
            style={{
              right: -2,
              bottom: -2,
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: colors.background,
            }}
          >
            <Icon name="camera" size={Math.round(badge * 0.5)} color="onPrimary" />
          </View>
        )}
      </Pressable>

      {label && (
        <Text variant="caption" color="secondary">
          {label}
        </Text>
      )}

      {value && !busy && !disabled && (
        <Pressable onPress={() => onChange(null)} className="active:opacity-70">
          <Text variant="caption" color="danger">
            {t("media.remove")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
