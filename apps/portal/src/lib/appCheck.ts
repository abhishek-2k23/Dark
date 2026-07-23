import appCheck from "@react-native-firebase/app-check";

/**
 * Firebase App Check activation (Play Integrity on Android, App Attest on iOS).
 *
 * ⚠️ NOT wired into app startup yet, on purpose. App Check only works once:
 *   1. this app has been rebuilt with the @react-native-firebase native modules
 *      (they are not in the current dev build — importing this file before that
 *      rebuild would crash),
 *   2. App Check is registered for this app in the Firebase console with the
 *      Play Integrity provider (+ the Google Cloud Play Integrity API enabled),
 *   3. a debug token is registered for local/dev builds (Play Integrity returns
 *      no valid verdict for a sideloaded build), and
 *   4. the backend verifies the App Check token on incoming requests — the
 *      client token is worthless without server-side verification.
 *
 * Once all four are in place, call `activateAppCheck()` once at app startup
 * (e.g. in the root layout, before the first authed request) and start sending
 * the token (`await appCheck().getToken()`) on API calls for the backend to
 * verify.
 */
export async function activateAppCheck(): Promise<void> {
  try {
    const provider = appCheck().newReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: {
        // 'debug' issues a local debug token (register it in the Firebase
        // console); 'playIntegrity' is the real attestation for release builds.
        provider: __DEV__ ? "debug" : "playIntegrity",
      },
      apple: {
        provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
      },
    });

    await appCheck().initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // Attestation must never block the app; a failure here just means requests
    // go out without an App Check token (the backend decides how to treat that).
  }
}
