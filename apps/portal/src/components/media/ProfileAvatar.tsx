import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { Avatar, Button, Icon, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/theme";
import { useUIStore } from "@/stores/uiStore";
import { withAlpha } from "@/utils/color";
import { toErrorMessage } from "@/utils/errors";
import { useImageUpload } from "./useImageUpload";

export interface ProfileAvatarProps {
  uri: string | null | undefined;
  name?: string;
  size?: number;
}

/**
 * The avatar on a profile tab. Two distinct targets, because they're two
 * different intents: the photo opens a full-screen view of itself, the pencil
 * goes straight to the picker. Routing "change my photo" through a viewer
 * first would put a screen between the user and the thing they asked for.
 *
 * Self-contained on purpose: it owns the profile.update mutation so all three
 * role tabs (resident, guard, admin) get the whole behaviour from one line —
 * guards and admins previously had no way to set a photo at all, since only
 * residents pass through profile-setup.
 */
export function ProfileAvatar({ uri, name, size = 88 }: ProfileAvatarProps) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const dark = scheme === "dark";

  const save = trpc.profile.update.useMutation({
    onSuccess: () => void utils.profile.me.invalidate(),
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const { busy, start } = useImageUpload({
    kind: "AVATAR",
    aspect: [1, 1],
    allowsEditing: true,
    onUploaded: (urls) => {
      const url = urls[0];
      if (url) save.mutate({ avatarUrl: url });
    },
  });

  const onRemove = () => {
    save.mutate(
      { avatarUrl: null },
      {
        onSuccess: () => {
          void utils.profile.me.invalidate();
          showToast(t("profile.photoRemoved"), "info");
          setOpen(false); // nothing left to look at
        },
      },
    );
  };

  const working = busy || save.isPending;
  const badge = 30;
  // A circle, sized to leave breathing room on the narrowest phones.
  const photo = Math.min(width - 96, 300);

  return (
    <>
      {/* Siblings, not nested: a Pressable inside a Pressable makes the badge's
          hit area ambiguous, and the wrong action on a profile photo is costly. */}
      <View style={{ width: size, height: size }}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("profile.viewPhoto")}
          className="active:opacity-80"
        >
          <Avatar uri={uri} name={name} size={size} ring="blue" />
        </Pressable>

        <Pressable
          onPress={start}
          disabled={working}
          accessibilityRole="button"
          accessibilityLabel={t(uri ? "media.changePhoto" : "media.addPhoto")}
          hitSlop={8}
          className="absolute items-center justify-center active:opacity-70"
          style={{
            // Kept inside the wrapper's bounds: Android clips absolutely
            // positioned children that spill outside their parent.
            right: 0,
            bottom: 0,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        >
          {working ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Icon name="pencil" size={14} color="onPrimary" />
          )}
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Android's hardware back closes the viewer, not the screen behind it.
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        {/* Tapping the backdrop dismisses; the content below swallows its taps. */}
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={40}
            tint={dark ? "dark" : "light"}
            // Android needs this method or the blur silently renders as nothing.
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : "none"}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              // Darkens the blur so a light photo still reads against it.
              { backgroundColor: withAlpha(dark ? "#050508" : "#0F172A", dark ? 0.6 : 0.4) },
            ]}
          />

          <View className="flex-1 items-center justify-center px-8">
            <Pressable onPress={() => {}} className="w-full items-center gap-7">
              <View
                className="items-center justify-center overflow-hidden"
                style={{
                  width: photo,
                  height: photo,
                  borderRadius: photo / 2,
                  borderWidth: 2,
                  borderColor: withAlpha(colors.neon.blue, 0.5),
                  backgroundColor: colors.glassFill,
                }}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Avatar name={name} size={photo} />
                )}

                {working && (
                  <View
                    className="absolute inset-0 items-center justify-center"
                    style={{ backgroundColor: withAlpha(colors.background, 0.55) }}
                  >
                    <ActivityIndicator color={colors.primary} size="large" />
                  </View>
                )}
              </View>

              <View className="items-center gap-1">
                {name && (
                  <Text variant="h2" align="center">
                    {name}
                  </Text>
                )}
                {!uri && (
                  <Text variant="bodySmall" color="secondary">
                    {t("profile.noPhoto")}
                  </Text>
                )}
              </View>

              <View className="w-full max-w-xs gap-3">
                <Button
                  label={t(uri ? "media.changePhoto" : "media.addPhoto")}
                  variant="primary"
                  size="lg"
                  leftIcon="camera-outline"
                  disabled={working}
                  onPress={() => {
                    // Close first: the source chooser is itself a Modal now,
                    // and presenting one over another is flaky on iOS. The
                    // pencil badge carries the upload spinner meanwhile.
                    setOpen(false);
                    start();
                  }}
                  fullWidth
                />
                {uri && (
                  <Button
                    label={t("media.remove")}
                    variant="dangerSoft"
                    size="lg"
                    leftIcon="trash-outline"
                    loading={save.isPending}
                    disabled={busy}
                    onPress={onRemove}
                    fullWidth
                  />
                )}
              </View>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            hitSlop={12}
            className="absolute items-center justify-center active:opacity-70"
            style={{
              top: 56,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: withAlpha(colors.background, 0.6),
              borderWidth: 1,
              borderColor: colors.glassBorder,
            }}
          >
            <Icon name="close" size={22} color="content" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
