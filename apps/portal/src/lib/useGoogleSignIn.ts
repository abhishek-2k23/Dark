import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "./env";

/** i18n key describing why sign-in failed. Cancelling is not a failure. */
export type GoogleSignInErrorKey =
  | "auth.googlePlayServices"
  | "auth.googleFailed";

export interface GoogleSignInHandle {
  /** False when sign-in can't run here at all — the caller shows a notice
   *  instead of opening a picker that would only fail. */
  available: boolean;
  /** Opens the native account picker. Resolves once the ID token has been
   *  handed to `onIdToken`, or the attempt was cancelled//failed. */
  promptAsync: () => Promise<void>;
}

/**
 * Native in-app Google sign-in. The Google SDK presents the account picker
 * itself — no browser round-trip — and hands back an ID token, which the caller
 * forwards to `auth.googleLogin`; the server verifies it (never trust a token
 * the client says is good) and issues our own session.
 *
 * On the three client ids, which are easy to confuse:
 * `webClientId` is deliberately the **web** OAuth client, not the Android or
 * iOS one. The native SDK takes it as `serverClientID` and stamps it into the
 * token's `aud` claim, which the API checks against its own `GOOGLE_CLIENT_ID`.
 * If those two differ, sign-in "works" on device and then every request 401s.
 * The Android client id is never named anywhere in this app — Google matches
 * that client by package name + signing certificate on the request.
 */
export function useGoogleSignIn(
  onIdToken: (idToken: string) => void,
  onError?: (key: GoogleSignInErrorKey) => void,
): GoogleSignInHandle {
  // No native SDK on web; and with no web client id there is no audience for
  // the server to verify, so there's nothing this could usefully do.
  const available = Platform.OS !== "web" && !!GOOGLE_CLIENT_ID;

  // Held in refs so a caller passing inline arrows (as the login screen does)
  // doesn't re-run configure() or rebuild promptAsync on every render.
  const onIdTokenRef = useRef(onIdToken);
  onIdTokenRef.current = onIdToken;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!available) return;
    // Synchronous and idempotent — safe to re-run, and must have happened
    // before any signIn() call.
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID!,
      iosClientId: GOOGLE_IOS_CLIENT_ID ?? undefined,
    });
  }, [available]);

  const promptAsync = useCallback(async () => {
    if (!available) return;
    try {
      // Android only; resolves immediately elsewhere. Prompts the user to fix
      // a missing/outdated Play Services rather than failing opaquely.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Clear any cached account so the picker always appears. Without this the
      // SDK silently reuses the last account, and someone who signed out of our
      // app could never switch Google accounts.
      await GoogleSignin.signOut();

      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // picker dismissed

      const { idToken } = response.data;
      if (!idToken) {
        // Shouldn't happen once webClientId is set — the SDK omits the token
        // when it isn't, which is exactly the misconfiguration above.
        onErrorRef.current?.("auth.googleFailed");
        return;
      }
      onIdTokenRef.current(idToken);
    } catch (e) {
      if (isErrorWithCode(e)) {
        // Backing out isn't an error worth interrupting anyone over.
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (e.code === statusCodes.IN_PROGRESS) return;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onErrorRef.current?.("auth.googlePlayServices");
          return;
        }
      }
      onErrorRef.current?.("auth.googleFailed");
    }
  }, [available]);

  return { available, promptAsync };
}
