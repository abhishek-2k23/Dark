import { Platform } from "react-native";

/**
 * Play Integrity (Android) / App Attest (iOS) via Firebase App Check.
 *
 * What this buys us: every request the app makes can carry a short-lived token
 * that Google itself signed, attesting that the caller is a genuine, unmodified
 * install of `com.prangan.app` from Play running on a real device. The API
 * verifies that token (`packages/auth/app-check.ts`), so a scraped bearer token
 * replayed from curl or a repackaged APK is distinguishable from the real app.
 *
 * The whole module is deliberately fail-soft. It is loaded lazily through
 * `require` rather than a top-level import because `@react-native-firebase/*`
 * throws at module scope when its native side is missing — which is the case in
 * Expo Go and in any build made before these packages were added. A static
 * import would take the entire app down on launch there; this way the app just
 * runs without attestation, and the server (in monitor mode) records that.
 *
 * Provider choice: `debug` in development, because a locally-built or
 * sideloaded app has no Play install to attest and `playIntegrity` would return
 * nothing but errors. The debug token is printed to the native log on first
 * launch and has to be pasted into Firebase console → App Check → Apps →
 * Manage debug tokens before a dev build gets a valid verdict.
 */

type AppCheckModule = typeof import("@react-native-firebase/app-check");
type AppCheckInstance = ReturnType<AppCheckModule["initializeAppCheck"]>;

/**
 * How long a request is willing to wait for a token. Play Integrity round-trips
 * to Google on a cold token and can take seconds; a request must never sit on
 * that. Missing the header is a soft failure by design — it costs the request
 * its attestation, not its result.
 */
const TOKEN_TIMEOUT_MS = 2_500;

let module: AppCheckModule | null = null;
let instance: AppCheckInstance | null = null;
/** Set once the native module or activation proves absent, so we stop retrying. */
let unavailable = false;

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
 * Starts attestation. Safe to call more than once, and safe to call on a build
 * that has no Firebase native module.
 *
 * Called once on launch (root `_layout`) rather than lazily on the first
 * request, so the first token is already being minted while the user is still
 * looking at the login screen.
 */
export function activateAppCheck(): void {
  if (instance || unavailable) return;

  const mod = load();
  if (!mod) return;

  try {
    const provider = new mod.ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: __DEV__ ? "debug" : "playIntegrity" },
      // App Attest needs iOS 14+; the fallback keeps older devices attesting
      // through DeviceCheck instead of failing outright.
      apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
      isTokenAutoRefreshEnabled: true,
    });

    instance = mod.initializeAppCheck(undefined, {
      provider,
      // Keeps a valid token in hand so `getAppCheckToken` is a cache read
      // rather than a network round-trip on all but the first call.
      isTokenAutoRefreshEnabled: true,
    });

    // Warm the cache. Failure here is expected and uninteresting on a dev build
    // whose debug token nobody registered yet.
    void getAppCheckToken();
  } catch (err) {
    unavailable = true;
    if (__DEV__) console.log("[appCheck] activation failed:", String(err));
  }
}

/**
 * The current attestation token, or `null` if this build/device cannot produce
 * one within {@link TOKEN_TIMEOUT_MS}. Never throws.
 */
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
 * The header the API reads. Empty when there is no token, so callers can spread
 * it unconditionally.
 *
 * Web is excluded on purpose: the Next.js app is served from a browser origin
 * with no Play Integrity or App Attest equivalent configured, and sending a
 * header the server would reject buys nothing.
 */
export async function appCheckHeaders(): Promise<Record<string, string>> {
  if (Platform.OS === "web") return {};
  const token = await getAppCheckToken();
  return token ? { "x-firebase-appcheck": token } : {};
}
