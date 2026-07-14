/**
 * Google sign-in is temporarily disabled — the button stays in the UI but is
 * inert (`available: false`), so pressing it just shows the "unavailable" toast
 * instead of crashing.
 *
 * The previous implementation called `expo-auth-session`'s
 * `Google.useAuthRequest`, which throws on native platforms unless a
 * platform-specific client id is configured (`androidClientId` on Android,
 * `iosClientId` on iOS) — that's the source of the
 * "Client Id property `androidClientId` must be defined" error.
 *
 * To re-enable later:
 *   1. Add the OAuth client ids to app.config.ts `extra` and env.ts.
 *   2. Restore the `Google.useAuthRequest` flow (see git history for this file),
 *      passing `androidClientId` / `iosClientId` / `webClientId`.
 */
export function useGoogleSignIn(_onIdToken: (idToken: string) => void) {
  return {
    available: false,
    promptAsync: async () => {},
  };
}
