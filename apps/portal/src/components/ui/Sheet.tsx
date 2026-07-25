import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** One line under the heading, explaining what this sheet is for. */
  subtitle?: string;
  children: ReactNode;
}

/**
 * A bottom sheet over a blurred backdrop: heading, close button, and whatever
 * the caller puts inside.
 *
 * Used for occasional errands that would otherwise clutter a screen — exporting
 * a report, filling in a missing detail. Tapping the backdrop or pressing
 * Android's back button dismisses it, matching what a sheet looks like it does.
 */
export function Sheet({ visible, onClose, title, subtitle, children }: SheetProps) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";

  return (
    <Modal
      visible={visible}
      transparent
      // Fade, not slide: the backdrop fills the screen, so sliding would drag
      // the blur up with the panel instead of just the panel. Matches DialogHost.
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop tap closes; the panel swallows its own taps. */}
      <Pressable className="flex-1 justify-end" onPress={onClose}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={30}
          tint={dark ? "dark" : "light"}
          // Android renders no blur at all without this method.
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : "none"}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(dark ? "#050508" : "#0F172A", dark ? 0.55 : 0.35) },
          ]}
        />

        <Pressable
          onPress={() => {}}
          className="gap-5 px-6 pt-3"
          style={{
            paddingBottom: insets.bottom + 24,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: colors.glassBorderStrong,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          {/* Grab handle — signals "drag or tap away to dismiss". */}
          <View
            className="h-1 w-10 self-center rounded-full"
            style={{ backgroundColor: colors.glassBorderStrong }}
          />

          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text variant="h3">{title}</Text>
              {subtitle && (
                <Text variant="caption" color="secondary">
                  {subtitle}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
              style={{ backgroundColor: colors.glassFill }}
            >
              <Icon name="close" size={18} color="secondary" />
            </Pressable>
          </View>

          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
