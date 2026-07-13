/**
 * In-memory access-token holder shared by the tRPC client and the auth store.
 *
 * Lives in its own module so the client (which reads the token per request) and
 * the store (which owns login/refresh) don't import each other. The refresh
 * handler is registered by the auth store; the client calls it on a 401.
 */

let accessToken: string | null = null;

/** Returns a fresh access token, or null if refresh failed / not signed in. */
type RefreshHandler = () => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function registerRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

export async function runTokenRefresh(): Promise<string | null> {
  if (!refreshHandler) return null;
  try {
    return await refreshHandler();
  } catch {
    return null;
  }
}
