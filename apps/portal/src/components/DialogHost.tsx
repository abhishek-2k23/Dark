import { BlurView } from "expo-blur";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { Button, Text, type ButtonVariant } from "@/components/ui";
import { useUIStore, type DialogTone } from "@/stores/uiStore";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";

const TONE_VARIANT: Record<DialogTone, ButtonVariant> = {
  primary: "primary",
  secondary: "outline",
  danger: "danger",
  neutral: "ghost",
};

/**
 * Renders the uiStore's current dialog as a themed glass card over a blurred
 * backdrop — the in-app replacement for Alert.alert, which draws the OS dialog
 * and ignores the app's theme completely. Mounted once in the root layout.
 */
export function DialogHost() {
  const dialog = useUIStore((s) => s.dialog);
  const dismiss = useUIStore((s) => s.dismissDialog);
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";

  return (
    <Modal
      visible={dialog !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android's hardware back = cancel.
      onRequestClose={dismiss}
    >
      {/* Backdrop tap = cancel; the card swallows its own taps. */}
      <Pressable className="flex-1 items-center justify-center px-8" onPress={dismiss}>
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
            // Scrim so the card reads against busy content in either theme.
            { backgroundColor: withAlpha(dark ? "#050508" : "#0F172A", dark ? 0.55 : 0.35) },
          ]}
        />

        {dialog && (
          <Pressable
            onPress={() => {}}
            className="w-full max-w-sm gap-5 p-6"
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.glassBorderStrong,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <View className="gap-1.5">
              <Text variant="h2">{dialog.title}</Text>
              {dialog.message && (
                <Text variant="body" color="secondary">
                  {dialog.message}
                </Text>
              )}
            </View>

            <View className="gap-2.5">
              {dialog.actions.map((action, i) => (
                <Button
                  key={`${action.label}-${i}`}
                  label={action.label}
                  variant={TONE_VARIANT[action.tone ?? "neutral"]}
                  size="lg"
                  fullWidth
                  onPress={() => {
                    // Close first: if the action opens the camera or another
                    // modal, a still-open dialog underneath fights it for focus.
                    dismiss();
                    action.onPress?.();
                  }}
                />
              ))}
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
