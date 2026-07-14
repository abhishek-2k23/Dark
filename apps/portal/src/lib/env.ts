import Constants from "expo-constants";
import { Platform } from "react-native";

interface Extra {
  apiUrl?: string;
  webUrl?: string;
  googleClientId?: string | null;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const rawApiUrl = extra.apiUrl ?? "http://localhost:8000";

/** Google OAuth web client id, or null when Google sign-in isn't configured. */
export const GOOGLE_CLIENT_ID = extra.googleClientId ?? null;

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
