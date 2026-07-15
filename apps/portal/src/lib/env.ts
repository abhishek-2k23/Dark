import Constants from "expo-constants";
import { Platform } from "react-native";

interface Extra {
  apiUrl?: string;
  webUrl?: string;
  googleClientId?: string | null;
  googleIosClientId?: string | null;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const rawApiUrl = extra.apiUrl ?? "http://localhost:8000";

/**
 * Google OAuth **web** client id, or null when Google sign-in isn't configured.
 *
 * Web, despite this being a native sign-in: the native SDK takes it as its
 * `serverClientID`, which is what lands in the ID token's `aud` claim. The API
 * verifies that claim against its own `GOOGLE_CLIENT_ID`, so this must be the
 * same web client id the server has, or every login fails with a 401.
 */
export const GOOGLE_CLIENT_ID = extra.googleClientId ?? null;

/**
 * Google OAuth **iOS** client id — required on iOS only, and unrelated to the
 * token audience above. Android needs no client id here: Google identifies that
 * client from the package name + signing certificate on the request itself.
 */
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId ?? null;

/**
 * The Android emulator can't reach the host via `localhost` — it maps the host
 * loopback to 10.0.2.2. Rewrite automatically so local dev "just works" there.
 * (iOS simulator and web can use localhost directly. Physical devices need a
 * LAN IP set via EXPO_PUBLIC_API_URL.)
 */
function resolveApiUrl(url: string): string {
  if (Platform.OS === "android") {
    return url.replace("localhost", "10.0.2.2").replace("127.0.0.1", "10.0.2.2");
  }
  return url;
}

/** Base URL of the API server, e.g. `http://localhost:8000`. */
export const API_BASE_URL = resolveApiUrl(rawApiUrl);

/** tRPC endpoint mounted by the Express server. */
export const TRPC_URL = `${API_BASE_URL}/trpc`;

/** REST (OpenAPI) base, e.g. for health checks. */
export const REST_BASE_URL = `${API_BASE_URL}/api`;

/**
 * Base URL of the web app hosting the legal/support & account-deletion pages,
 * opened from the profile screen via an in-app browser. Trailing slash trimmed
 * so callers can append `/privacy`, `/delete-account`, etc.
 */
export const WEB_BASE_URL = (
  extra.webUrl ?? "https://prangan.iamabhishek01.dev"
).replace(/\/+$/, "");
