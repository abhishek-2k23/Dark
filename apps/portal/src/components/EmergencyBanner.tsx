import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

const RED = "#DC2626";

/**
 * A persistent strip pinned over everything while an alarm is live in the
 * user's society. Rendered at the root rather than per-screen on purpose: an
 * active emergency should follow you across navigation, not be something you
 * can walk away from by changing tabs.
 *
 * Tapping it offers to stand the alarm down — any member can, so the responder
 * who arrives first doesn't have to hunt for an admin.
 */
export function EmergencyBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const showDialog = useUIStore((s) => s.showDialog);
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const active = trpc.emergency.active.useQuery(undefined, {
    // Polled rather than push-driven: a push can be missed or denied, and this
    // banner is the last line that tells someone an alarm is still open.
    refetchInterval: 30_000,
  });

  const resolve = trpc.emergency.resolve.useMutation({
    onSuccess: () => {
      showToast(t("emergency.standDownToast"), "success");
      void utils.emergency.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const alerts = active.data ?? [];
  const alert = alerts[0];
  if (!alert) return null;

  const where = alert.flatLabel ?? t("emergency.somewhereInSociety");

  return (
    <Pressable
      onPress={() =>
        showDialog({
          title: t(`emergency.type.${alert.type}`),
          message: t("emergency.bannerDialogBody", {
            name: alert.raisedBy.name,
            where,
          }),
          actions: [
            { label: t("common.cancel"), tone: "neutral" },
            {
              label: t("emergency.standDown"),
              tone: "danger",
              onPress: () => resolve.mutate({ emergencyId: alert.id }),
            },
          ],
        })
      }
      className="absolute left-0 right-0 z-50 flex-row items-center gap-3 px-4 pb-3 active:opacity-90"
      style={{ top: 0, paddingTop: insets.top + 8, backgroundColor: RED }}
    >
      <Icon name="warning" size={22} color="#fff" />
      <View className="flex-1">
        <Text variant="subtitle" numberOfLines={1} style={{ color: "#fff" }}>
          {/* More than one live alarm is rare but real — say so rather than
              silently showing only the newest. */}
          {alerts.length > 1
            ? t("emergency.bannerMany", { count: alerts.length })
            : t(`emergency.type.${alert.type}`)}
        </Text>
        <Text variant="caption" numberOfLines={1} style={{ color: "#ffffffdd" }}>
          {t("emergency.bannerWho", { name: alert.raisedBy.name, where })}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="#fff" />
    </Pressable>
  );
}
