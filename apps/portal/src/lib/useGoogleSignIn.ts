import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

import { GOOGLE_CLIENT_ID } from "./env";

// Required so the auth popup/redirect can settle back into the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Wraps the Expo Google auth request. `available` is false until a
 * `googleClientId` is configured (see app.config.ts), so callers can degrade
 * gracefully; once set, `promptAsync` runs the native flow and `onIdToken`
 * fires with the Google ID token to hand to `auth.googleLogin`.
 */
export function useGoogleSignIn(onIdToken: (idToken: string) => void) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_ID ?? undefined,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken =
        response.authentication?.idToken ??
        (response.params?.id_token as string | undefined);
      if (idToken) onIdToken(idToken);
    }
    // onIdToken intentionally omitted — we only react to a new response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    available: Boolean(GOOGLE_CLIENT_ID && request),
    promptAsync,
  };
}
