import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Modal, View, type AppStateStatus } from "react-native";

import { Button, IconCircle, Screen, Text } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { useBiometricStore } from "@/stores/biometricStore";

/**
 * Full-screen biometric lock.
 *
 * When the app-lock preference is on, this veils the app on cold start and
 * every time it returns from the background, until the owner passes the
 * biometric prompt. Only an authenticated session is ever veiled — the sign-in
 * screens hold nothing private, and prompting there would just be a wall.
 */
export function BiometricGate() {
  const { t } = useTranslation();
  const authed = useAuthStore((s) => s.status === "authenticated");
  const enabled = useBiometricStore((s) => s.enabled);
  const locked = useBiometricStore((s) => s.locked);
  const label = useBiometricStore((s) => s.label);
  const lock = useBiometricStore((s) => s.lock);
  const unlock = useBiometricStore((s) => s.unlock);

  const show = authed && enabled && locked;
  const prompt = t("settings.biometricUnlockPrompt", { method: label });

  // Re-veil when the app is truly backgrounded, so a returning session must
  // re-authenticate. Deliberately not "inactive": the OS biometric prompt drops
  // the app to inactive, and re-locking there would trap a cancelled toggle
  // behind the gate. lock() no-ops unless the preference is on.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background") lock();
    });
    return () => sub.remove();
  }, [lock]);

  // Auto-present the prompt as soon as the lock appears (cold start or return);
  // the ref keeps one lock from firing two prompts, and resets when it clears.
  const prompted = useRef(false);
  useEffect(() => {
    if (show && !prompted.current) {
      prompted.current = true;
      void unlock(prompt);
    } else if (!show) {
      prompted.current = false;
    }
  }, [show, unlock, prompt]);

  return (
    <Modal
      visible={show}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <Screen contentClassName="items-center justify-center gap-7">
        <IconCircle name="lock-closed" tone="primary" size={80} />
        <View className="gap-2">
          <Text variant="h2" align="center">
            {t("settings.biometricLockedTitle")}
          </Text>
          <Text variant="body" color="secondary" align="center">
            {t("settings.biometricLockedBody", { method: label })}
          </Text>
        </View>
        <Button
          label={t("settings.biometricUnlock", { method: label })}
          size="lg"
          onPress={() => void unlock(prompt)}
          fullWidth
        />
      </Screen>
    </Modal>
  );
}
