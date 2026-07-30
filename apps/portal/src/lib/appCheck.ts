import { Platform } from "react-native";

/**
 * Play Integrity (Android) / App Attest (iOS) via Firebase App Check. Attaches a
 * Google-signed token to every API call so a replayed bearer token is
 * distinguishable from the real app. Fail-soft throughout.
 */

type AppCheckModule = typeof import("@react-native-firebase/app-check");
type AppCheckInstance = ReturnType<AppCheckModule["initializeAppCheck"]>;

/** A cold Play Integrity round-trip must never hold up a request. */
const TOKEN_TIMEOUT_MS = 2_500;

let module: AppCheckModule | null = null;
let instance: AppCheckInstance | null = null;
/** Set once the native module or activation proves absent, so we stop retrying. */
let unavailable = false;

// Lazy `require`: `@react-native-firebase/*` throws at module scope where its
// native side is missing (Expo Go, any build predating these packages), and a
// static import would take the app down on launch there.
function load(): AppCheckModule | null {
  if (module) return module;
  if (unavailable) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require("@react-native-firebase/app-check") as AppCheckModule;
    return module;
  } catch (err) {
    unavailable = true;
    if (__DEV__) console.log("[appCheck] native module unavailable:", String(err));
    return null;
  }
}

/**
 * Starts attestation. Idempotent, and safe on a build with no Firebase native
 * module. Called once on launch so the first token is minted while the user is
 * still on the login screen.
 */
export function activateAppCheck(): void {
  if (instance || unavailable) return;

  const mod = load();
  if (!mod) return;

  try {
    const provider = new mod.ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      // `debug` in dev: a locally built app has no Play install to attest. The
      // token is printed to the native log and must be registered in Firebase
      // console → App Check → Manage debug tokens.
      android: { provider: __DEV__ ? "debug" : "playIntegrity" },
      // App Attest needs iOS 14+; the fallback keeps older devices attesting.
      apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
      isTokenAutoRefreshEnabled: true,
    });

    instance = mod.initializeAppCheck(undefined, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });

    // Warm the cache so later calls are a cache read, not a network round-trip.
    void getAppCheckToken();
  } catch (err) {
    unavailable = true;
    if (__DEV__) console.log("[appCheck] activation failed:", String(err));
  }
}

/** The current token, or `null` if this build/device cannot produce one. Never throws. */
export async function getAppCheckToken(): Promise<string | null> {
  if (!instance || unavailable) return null;
  const mod = load();
  if (!mod) return null;

  try {
    const result = await Promise.race([
      mod.getToken(instance, false),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS)),
    ]);
    return result?.token ?? null;
  } catch (err) {
    if (__DEV__) console.log("[appCheck] token failed:", String(err));
    return null;
  }
}

/**
 * Empty when there is no token, so callers can spread it unconditionally. Web is
 * excluded: a browser has no Play Integrity or App Attest equivalent here.
 */
export async function appCheckHeaders(): Promise<Record<string, string>> {
  if (Platform.OS === "web") return {};
  const token = await getAppCheckToken();
  return token ? { "x-firebase-appcheck": token } : {};
}
