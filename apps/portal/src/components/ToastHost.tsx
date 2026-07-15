import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { elevation, useTheme, type ThemeColors } from "@/theme";
import { useUIStore, type ToastType } from "@/stores/uiStore";
import { withAlpha } from "@/utils/color";
import { Icon, type IconName } from "./ui/Icon";
import { Text } from "./ui/Text";

/** Accent per toast type — rendered as a glass chip with a neon hairline. */
const TOAST: Record<
  ToastType,
  { accent: (c: ThemeColors) => string; icon: IconName }
> = {
  success: { accent: (c) => c.success, icon: "checkmark-circle" },
  error: { accent: (c) => c.danger, icon: "alert-circle" },
  info: { accent: (c) => c.primary, icon: "information-circle" },
};

/**
 * Overlay that renders queued toasts from the UI store. Mounted once near the
 * app root, above the navigator. Tap a toast to dismiss it early.
 */
export function ToastHost() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12 }}
      className="items-center px-4"
    >
      <View className="w-full max-w-xl gap-2">
        {toasts.map((t) => {
          const cfg = TOAST[t.type];
          const accent = cfg.accent(colors);
          return (
            <Pressable
              key={t.id}
              onPress={() => dismiss(t.id)}
              style={[
                elevation.lg,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: withAlpha(accent, 0.45),
                },
              ]}
              className="flex-row items-center gap-2.5 rounded-2xl px-4 py-3 active:opacity-90"
            >
              <Icon name={cfg.icon} size={20} color={accent} />
              <Text
                variant="subtitle"
                className="shrink"
                numberOfLines={3}
              >
                {t.message}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
