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
/** Separate channel so the panic alarm can be loud without the rest being loud. */
const ANDROID_EMERGENCY_CHANNEL_ID = "emergency";

/** Its own channel so a file-saved notice can't be silenced with the rest. */
export const ANDROID_DOWNLOAD_CHANNEL_ID = "downloads";

/** Marks a locally-raised "your file is ready" notification. */
export const DOWNLOAD_NOTIFICATION_KIND = "download";

/** Push types that must interrupt regardless of what the user is doing. */
function isEmergency(data: unknown): boolean {
  const type = (data as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.startsWith("EMERGENCY");
}

/**
 * A completed download, raised locally by `lib/download.ts`.
 *
 * These deliberately break the foreground-suppression rule below. Every other
 * notification is a server push about something happening elsewhere, which a
 * toast conveys better while the user is looking at the app. A download is the
 * opposite: the user asked for it seconds ago, it is what every OS shows a
 * notification for, and the notification is the handle they tap to open the
 * file afterwards. Suppressing it would read as the download having failed.
 */
function isDownload(data: unknown): boolean {
  return (data as { kind?: unknown } | null)?.kind === DOWNLOAD_NOTIFICATION_KIND;
}

/** The permission fields we read, kept local because the modules-core stub erases them. */
interface Perm {
  granted: boolean;
  canAskAgain: boolean;
}

// How a notification behaves while the app is foregrounded — this handler runs
// *only* then; a push arriving in the background is drawn by the OS untouched.
//
// Foreground pushes are deliberately silent: no banner, no sound. A busy evening
// can produce a burst of these (a dozen guest passes hitting every guard at
// once), and stacking OS banners over an app the user is already looking at is
// noise, not information. The receipt still lands — NotificationsListener
// refreshes the inbox and the open screen's data, and raises an in-app toast —
// so the user sees it in the app's own idiom instead.
//
// `shouldShowList` stays on so the notification is still recoverable from the
// OS tray after the toast goes; only the interruptive parts are suppressed.
//
// The panic alarm is the sole exception and stays loud in the foreground: an
// alarm the user has to notice is the entire point, and someone staring at the
// app is exactly who can respond fastest.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const { data } = notification.request.content;
    const urgent = isEmergency(data);
    const download = isDownload(data);
    return {
      shouldShowBanner: urgent || download,
      shouldShowList: true,
      // A download chimes at most once and is user-initiated; the alarm is the
      // only thing allowed to be loud.
      shouldPlaySound: urgent,
      // Saved files are not an inbox item, so they must not bump the badge.
      shouldSetBadge: !download,
    };
  },
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
  // MAX importance + vibration so a panic alarm produces a heads-up notification
  // even over other apps. Kept as its own channel because Android channel
  // settings are user-editable per channel: someone silencing routine Portl
  // notifications must not silence the alarm along with them.
  await Notifications.setNotificationChannelAsync(ANDROID_EMERGENCY_CHANNEL_ID, {
    name: "Emergency alarms",
    importance: Notifications.AndroidImportance.MAX,
    lightColor: "#DC2626",
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  });
  // Silent by design: a saved file should appear in the shade, not chime.
  await Notifications.setNotificationChannelAsync(ANDROID_DOWNLOAD_CHANNEL_ID, {
    name: "Downloads",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0],
    lightColor: "#2563EB",
  });
}

/**
 * Ensure notification permission, asking once if it has not been decided.
 * Android 13+ requires it even for purely local notifications.
 *
 * Returns false rather than throwing when refused — a denied permission must
 * never fail the download that triggered it.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    const existing = (await Notifications.getPermissionsAsync()) as unknown as Perm;
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const requested = (await Notifications.requestPermissionsAsync()) as unknown as Perm;
    return requested.granted;
  } catch {
    return false;
  }
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
