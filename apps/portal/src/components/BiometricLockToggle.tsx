import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Card, IconCircle, Switch, Text } from "@/components/ui";
import { useBiometricStore } from "@/stores/biometricStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * Profile control for the biometric app-lock. Renders its own "Security"
 * section — or nothing, when the device has no enrolled biometric, since
 * there'd be no way to satisfy the lock it offers.
 *
 * Flipping the switch runs a live biometric check (both on and off) before the
 * preference sticks; a cancelled or failed prompt leaves the switch where it
 * was, so the visible state never drifts from what's actually stored.
 */
export function BiometricLockToggle() {
  const { t } = useTranslation();
  const available = useBiometricStore((s) => s.available);
  const enabled = useBiometricStore((s) => s.enabled);
  const label = useBiometricStore((s) => s.label);
  const setEnabled = useBiometricStore((s) => s.setEnabled);
  const showToast = useUIStore((s) => s.showToast);

  if (!available) return null;

  const onToggle = async (next: boolean) => {
    const ok = await setEnabled(
      next,
      next
        ? t("settings.biometricEnablePrompt", { method: label })
        : t("settings.biometricDisablePrompt", { method: label }),
    );
    if (!ok) {
      showToast(t("settings.biometricFailed"), "error");
      return;
    }
    showToast(
      next ? t("settings.biometricOn") : t("settings.biometricOff"),
      "success",
    );
  };

  return (
    <View className="gap-2.5">
      <Text variant="label" color="secondary">
        {t("settings.security")}
      </Text>
      <Card variant="filled" className="flex-row items-center gap-3">
        <IconCircle name="finger-print" tone="primary" size={38} />
        <View className="flex-1 gap-0.5">
          <Text variant="subtitle">{t("settings.biometricLock")}</Text>
          <Text variant="bodySmall" color="secondary">
            {t("settings.biometricDesc", { method: label })}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(next) => void onToggle(next)}
          accessibilityLabel={t("settings.biometricLock")}
        />
      </Card>
    </View>
  );
}
