import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { elevation } from "@/theme";
import { useUIStore, type ToastType } from "@/stores/uiStore";
import { cn } from "@/utils/cn";
import { Icon, type IconName } from "./ui/Icon";
import { Text } from "./ui/Text";

const TOAST: Record<ToastType, { bg: string; icon: IconName }> = {
  success: { bg: "bg-success", icon: "checkmark-circle" },
  error: { bg: "bg-danger", icon: "alert-circle" },
  info: { bg: "bg-primary-strong", icon: "information-circle" },
};

/**
 * Overlay that renders queued toasts from the UI store. Mounted once near the
 * app root, above the navigator. Tap a toast to dismiss it early.
 */
export function ToastHost() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();

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
          return (
            <Pressable
              key={t.id}
              onPress={() => dismiss(t.id)}
              style={elevation.lg}
              className={cn(
                "flex-row items-center gap-2.5 rounded-2xl px-4 py-3 active:opacity-90",
                cfg.bg,
              )}
            >
              <Icon name={cfg.icon} size={20} color="onPrimary" />
              <Text
                variant="subtitle"
                color="onPrimary"
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
