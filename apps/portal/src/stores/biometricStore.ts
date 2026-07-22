import { create } from "zustand";

import { authenticate, getBiometricInfo } from "@/lib/biometrics";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/secureStore";

/**
 * Biometric app-lock state.
 *
 * The lock sits *on top of* an authenticated session: it re-verifies the person
 * holding the phone, it doesn't replace login. So `locked` only ever matters
 * while `enabled` is on and a session exists — see BiometricGate for where that
 * gating happens.
 *
 * Prompt strings are passed in by callers rather than read here, because the
 * store has no access to the active locale; components own the translation.
 */
interface BiometricState {
  /** Hardware present AND at least one biometric enrolled on this device. */
  available: boolean;
  /** Friendly name for the enrolled method: "Face ID", "Fingerprint", … */
  label: string;
  /** User preference: require biometric auth to open the app. */
  enabled: boolean;
  /** True while the app is veiled behind the biometric prompt. */
  locked: boolean;
  /** The capability probe + persisted preference have loaded. */
  ready: boolean;
  /** Load the stored preference and probe the sensor (app launch). */
  hydrate: () => Promise<void>;
  /**
   * Flip the preference. Both directions require a live check: turning it on
   * proves the user can get back in, turning it off proves the person holding
   * an unlocked phone is the owner. Returns whether the change stuck.
   */
  setEnabled: (next: boolean, promptMessage: string) => Promise<boolean>;
  /** Re-veil the app (called when it returns from the background). */
  lock: () => void;
  /** Run the prompt; clears the veil on success. Returns whether it cleared. */
  unlock: (promptMessage: string) => Promise<boolean>;
}

export const useBiometricStore = create<BiometricState>((set, get) => ({
  available: false,
  label: "Biometrics",
  enabled: false,
  locked: false,
  ready: false,

  hydrate: async () => {
    const info = await getBiometricInfo();
    const stored = (await getItem(STORAGE_KEYS.biometricEnabled)) === "1";
    // A sensor that was wiped or disabled in OS settings silently turns the
    // lock off — never strand the user behind a prompt the device can't answer.
    const enabled = stored && info.available;
    set({
      available: info.available,
      label: info.label,
      enabled,
      // Cold start behind the lock: veil the very first paint.
      locked: enabled,
      ready: true,
    });
  },

  setEnabled: async (next, promptMessage) => {
    if (!get().available) return false;
    const ok = await authenticate(promptMessage);
    if (!ok) return false;
    await setItem(STORAGE_KEYS.biometricEnabled, next ? "1" : "0");
    // The user just authenticated, so leave them inside — don't re-veil.
    set({ enabled: next, locked: false });
    return true;
  },

  lock: () => {
    if (get().enabled) set({ locked: true });
  },

  unlock: async (promptMessage) => {
    const ok = await authenticate(promptMessage);
    if (ok) set({ locked: false });
    return ok;
  },
}));
