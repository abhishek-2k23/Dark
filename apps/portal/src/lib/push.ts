import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/lib/trpc";

/**
 * Device-side push notifications: how a push is shown, requesting permission,
 * and syncing the device's Expo push token with the server. Everything here is
 * best-effort — a user who denies notifications (or an emulator that can't get a
 * token) must still be able to use the app, so nothing throws to the caller.
 *
 * The token is keyed server-side by (userId, token), so registration is driven
 * from the auth lifecycle (`setSession`) rather than app launch: a token always
 * belongs to whoever is currently signed in on this device.
 */

const ANDROID_CHANNEL_ID = "default";

/** The permission fields we read, kept local because the modules-core stub erases them. */
interface Perm {
  granted: boolean;
  canAskAgain: boolean;
}

// How a notification behaves while the app is foregrounded. Without this, pushes
// received in-app are silently swallowed by the OS.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** EAS project id — required by getExpoPushTokenAsync outside of Expo Go. */
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

/** Maps the running platform to the server's DeviceType enum. */
function deviceType(): "IOS" | "ANDROID" | null {
  if (Platform.OS === "ios") return "IOS";
  if (Platform.OS === "android") return "ANDROID";
  return null; // web / unsupported — no push
}

/**
 * Android requires a notification channel for heads-up display and to carry the
 * accent color; iOS ignores this. Safe to call repeatedly (it upserts).
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#2563EB",
  });
}

/**
 * Request permission (if not already decided), fetch this device's Expo push
 * token, and register it with the server for the signed-in user. Returns the
 * token on success, or null if push isn't available / was declined. Never throws.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const platform = deviceType();
    if (!platform) return null;

    // Real push only works on physical devices — emulators/simulators can't
    // obtain a token (remote push was also removed from Expo Go in SDK 53+).
    if (!Device.isDevice) {
      if (__DEV__) console.log("[push] skipped: not a physical device");
      return null;
    }

    await ensureAndroidChannel();

    // The tsc-only `expo-modules-core` stub (see src/types/*) erases the
    // inherited PermissionResponse fields, so read them through a minimal shape.
    const existing = (await Notifications.getPermissionsAsync()) as unknown as Perm;
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested =
        (await Notifications.requestPermissionsAsync()) as unknown as Perm;
      granted = requested.granted;
    }
    if (!granted) {
      if (__DEV__) console.log("[push] permission not granted");
      return null;
    }

    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined,
    );

    await api.pushToken.register.mutate({ token, deviceType: platform });
    if (__DEV__) console.log("[push] registered token", token);
    return token;
  } catch (err) {
    if (__DEV__) console.log("[push] registration failed", err);
    return null;
  }
}

/**
 * DEV ONLY — fire a *local* notification (never leaves the device) so the
 * notification handler + tap deep-linking can be exercised without any FCM/APNs
 * credentials or a push build. Works in Expo Go and on emulators, since only
 * remote push tokens are gated there, not local notifications. Pass the same
 * `data` shape the server sends (e.g. `{ type, visitorId }`) to test routing.
 */
export async function sendTestNotification(input: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    await ensureAndroidChannel();
    // Android 13+ requires notification permission even for local notifications.
    const perm = (await Notifications.getPermissionsAsync()) as unknown as Perm;
    if (!perm.granted) {
      const requested =
        (await Notifications.requestPermissionsAsync()) as unknown as Perm;
      if (!requested.granted) return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body, data: input.data ?? {} },
      trigger: null, // deliver immediately
    });
  } catch (err) {
    if (__DEV__) console.log("[push] test notification failed", err);
  }
}

/**
 * Remove this device's token from the server (called on sign-out). Best-effort:
 * a failure here must never block logout.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  try {
    if (!deviceType() || !Device.isDevice) return;
    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined,
    );
    await api.pushToken.unregister.mutate({ token });
    if (__DEV__) console.log("[push] unregistered token", token);
  } catch (err) {
    if (__DEV__) console.log("[push] unregister failed", err);
  }
}
