import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppState, type AppStateStatus } from "react-native";

import { useAuthStore } from "@/stores/authStore";
import { useBiometricStore } from "@/stores/biometricStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * EAS (OTA) updates, applied without hijacking the session.
 *
 * This used to fetch an update and call `reloadAsync()` immediately, which
 * restarted the app out from under whoever was using it — mid-payment,
 * mid-complaint, mid-anything. Now:
 *
 *   1. **Nothing blocks a launch.** `fallbackToCacheTimeout: 0` in
 *      app.config.ts means the app always starts on the bundle it already has;
 *      expo-updates checks and downloads in the background from there.
 *   2. **Downloads are silent.** This hook adds a check when the app returns to
 *      the foreground (the native module only checks on cold start), fetches
 *      into the cache, and stops. Nothing reloads on its own.
 *   3. **A pending update applies on the next natural launch**, so doing
 *      nothing is always a valid outcome and the update is never lost.
 *   4. **A restart is offered, not taken.** Once a bundle is ready we ask; the
 *      answer is remembered for the session so nobody gets nagged.
 *
 * No-op in development / Expo Go, where `Updates.isEnabled` is false.
 */

/** Floor on how often a foreground return may re-check the update server. */
const CHECK_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Breathing room after mount before the restart prompt may appear. A cold-start
 * background download can finish within a second or two, and a dialog thrown up
 * during the splash hand-off reads as a glitch.
 */
const PROMPT_GRACE_MS = 5000;

export function useOTAUpdates() {
  const { t } = useTranslation();
  // Reflects native-initiated downloads too, so the cold-start check the
  // native module runs also drives the prompt below.
  const { isUpdatePending } = Updates.useUpdates();

  const authStatus = useAuthStore((s) => s.status);
  const locked = useBiometricStore((s) => s.locked);

  const lastCheckAt = useRef(0);
  const prompted = useRef(false);
  /** Stamped on mount, not at render — `Date.now()` during render is impure. */
  const mountedAt = useRef(0);

  // --- silent background download ------------------------------------------
  useEffect(() => {
    // Set before the isEnabled guard, and in the first-declared effect, so the
    // prompt effect below always reads a real timestamp.
    mountedAt.current = Date.now();
    if (!Updates.isEnabled) return;

    async function downloadQuietly() {
      if (Date.now() - lastCheckAt.current < CHECK_COOLDOWN_MS) return;
      lastCheckAt.current = Date.now();
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        // Fetch into the cache and stop there. `isUpdatePending` flips true
        // when it lands; the reload is the user's call, or the next launch's.
        await Updates.fetchUpdateAsync();
      } catch {
        // Offline or update server unreachable — stay on the current bundle.
      }
    }

    // Cold start is already covered by `checkAutomatically: "ON_LOAD"`, so this
    // deliberately only handles coming back to the foreground.
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void downloadQuietly();
    });
    return () => sub.remove();
  }, []);

  // --- offer to apply it now -----------------------------------------------
  useEffect(() => {
    if (!Updates.isEnabled || !isUpdatePending || prompted.current) return;
    // Never prompt behind a veil: DialogHost renders *below* both the splash
    // and the biometric gate, so a dialog opened now would be invisible yet
    // still consume the tap that dismisses it.
    if (authStatus === "loading" || locked) return;

    const timer = setTimeout(
      () => {
        if (prompted.current) return;
        prompted.current = true;
        useUIStore.getState().showDialog({
          title: t("updates.readyTitle"),
          message: t("updates.readyBody"),
          actions: [
            {
              label: t("updates.restartNow"),
              tone: "primary",
              onPress: () => {
                void Updates.reloadAsync();
              },
            },
            { label: t("updates.later"), tone: "neutral" },
          ],
        });
      },
      Math.max(0, PROMPT_GRACE_MS - (Date.now() - mountedAt.current)),
    );

    return () => clearTimeout(timer);
  }, [isUpdatePending, authStatus, locked, t]);
}
