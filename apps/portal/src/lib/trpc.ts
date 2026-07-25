import type { ServerRouter } from "@repo/trpc/server";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
  type TRPCLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import { getAccessToken, runTokenRefresh } from "./authToken";
import { TRPC_URL } from "./env";

/** Typed tRPC hooks (`trpc.auth.login.useMutation()`, etc.). */
export const trpc = createTRPCReact<ServerRouter>();

/** Bearer header from the current in-memory access token. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * fetch wrapper that transparently refreshes an expired access token once on a
 * 401 and retries. Skipped for `auth.*` calls (their URLs contain "auth.") so
 * login/refresh themselves never trigger a refresh loop.
 */
const authFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  const isAuthCall = url.includes("auth.");
  const method = (init?.method ?? "GET").toUpperCase();
  // Log the tRPC procedure name (the ?input part is noisy/omitted).
  const label = url.replace(TRPC_URL, "").split("?")[0] || url;
  const started = Date.now();
  if (__DEV__) console.log(`[API →] ${method} ${label}`);

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    // Network-level failure (server unreachable, CORS, timeout) — fetch rejects
    // here rather than returning a Response, so surface it explicitly.
    if (__DEV__) console.log(`[API ✕] ${method} ${label} — network error:`, String(err));
    throw err;
  }

  if (__DEV__) {
    console.log(`[API ←] ${res.status} ${method} ${label} (${Date.now() - started}ms)`);
  }

  if (res.status === 401 && !isAuthCall) {
    const fresh = await runTokenRefresh();
    if (fresh) {
      if (__DEV__) console.log(`[API ↻] retrying ${label} with refreshed token`);
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      headers.set("authorization", `Bearer ${fresh}`);
      res = await fetch(input, { ...init, headers });
    }
  }
  return res;
};

/**
 * Shared link chain.
 *
 * `auth.*` procedures use a non-batching link because the API's auth rate
 * limiter matches exact paths (a batched `/trpc/auth.login,auth.me` URL would
 * bypass it). `resident.import*` joins them for the same reason: those carry a
 * base64 spreadsheet and the API raises its body-size limit by exact path, so
 * a batched URL would be rejected at 100kb. Everything else is batched.
 * superjson matches the server's transformer on the /trpc surface.
 */
function isUnbatched(path: string): boolean {
  return path.startsWith("auth.") || path.startsWith("resident.import");
}

function trpcLinks(): TRPCLink<ServerRouter>[] {
  return [
    splitLink({
      condition: (op) => isUnbatched(op.path),
      true: httpLink({
        url: TRPC_URL,
        transformer: superjson,
        fetch: authFetch,
        headers: authHeaders,
      }),
      false: httpBatchLink({
        url: TRPC_URL,
        transformer: superjson,
        fetch: authFetch,
        headers: authHeaders,
      }),
    }),
  ];
}

/** React-query-integrated client (used by the TRPCProvider). */
export function makeTRPCClient() {
  return trpc.createClient({ links: trpcLinks() });
}

/**
 * Vanilla client for imperative calls outside React — token refresh on launch,
 * logout, and the auth-store login/verify flows.
 */
export const api = createTRPCClient<ServerRouter>({ links: trpcLinks() });
