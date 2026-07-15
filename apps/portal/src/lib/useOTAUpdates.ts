import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Applies EAS (OTA) updates. On cold start — and again whenever the app returns
 * to the foreground — it checks the update server, downloads any new JS/asset
 * bundle for the current runtimeVersion, and reloads into it.
 *
 * No-op in development / Expo Go (`Updates.isEnabled` is false there), so it only
 * ever runs in release builds. Failures (offline, server unreachable) are
 * swallowed — the app keeps running the bundle it already has.
 */
export function useOTAUpdates() {
  useEffect(() => {
    if (!Updates.isEnabled) return;

    async function applyIfAvailable() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // Offline or update server unreachable — stay on the current bundle.
      }
    }

    void applyIfAvailable();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void applyIfAvailable();
    });
    return () => sub.remove();
  }, []);
}
