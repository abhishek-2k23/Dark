import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Small persistent key/value wrapper.
 *
 * Uses the OS keychain/keystore via expo-secure-store on native. That module
 * isn't available on web, so we fall back to localStorage there (dev only — the
 * app primarily targets iOS/Android).
 */

const isWeb = Platform.OS === "web";

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Storage keys. */
export const STORAGE_KEYS = {
  refreshToken: "portl.refreshToken",
} as const;
