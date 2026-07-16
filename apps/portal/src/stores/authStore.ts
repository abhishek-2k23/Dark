import type { ServerRouter } from "@repo/trpc/server";
import type { inferRouterOutputs } from "@trpc/server";
import { create } from "zustand";

import { registerRefreshHandler, setAccessToken } from "@/lib/authToken";
import {
  registerForPushNotifications,
  unregisterForPushNotifications,
} from "@/lib/push";
import { deleteItem, getItem, setItem, STORAGE_KEYS } from "@/lib/secureStore";
import { api } from "@/lib/trpc";

type RouterOutputs = inferRouterOutputs<ServerRouter>;
/** `{ accessToken, refreshToken, user }` — the shape every session returns. */
export type Session = RouterOutputs["auth"]["verifyEmailOtp"];
export type AuthUser = Session["user"];
export type Role = AuthUser["role"];

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Read the persisted refresh token and restore the session (app launch). */
  hydrate: () => Promise<void>;
  /** Adopt a freshly-issued session (after login / OTP verify). */
  setSession: (session: Session) => Promise<void>;
  /** Exchange the stored refresh token for a new access token, or sign out. */
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,

  hydrate: async () => {
    const refreshToken = await getItem(STORAGE_KEYS.refreshToken);
    if (!refreshToken) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    try {
      const session = await api.auth.refresh.mutate({ refreshToken });
      await get().setSession(session);
    } catch {
      await clearSession();
      set({ status: "unauthenticated", user: null });
    }
  },

  setSession: async (session) => {
    setAccessToken(session.accessToken);
    await setItem(STORAGE_KEYS.refreshToken, session.refreshToken);
    set({ status: "authenticated", user: session.user });
    // Sync this device's push token for the now-signed-in user. Fire-and-forget:
    // it's best-effort and must never delay the session becoming usable. Safe to
    // repeat on token refresh — the server upserts by (user, token).
    void registerForPushNotifications();
  },

  refresh: async () => {
    const refreshToken = await getItem(STORAGE_KEYS.refreshToken);
    if (!refreshToken) {
      await clearSession();
      set({ status: "unauthenticated", user: null });
      return null;
    }
    try {
      const session = await api.auth.refresh.mutate({ refreshToken });
      await get().setSession(session);
      return session.accessToken;
    } catch {
      await clearSession();
      set({ status: "unauthenticated", user: null });
      return null;
    }
  },

  logout: async () => {
    // Drop this device's push token first, while the access token is still valid
    // (the mutation is authenticated). Awaited but internally best-effort, so a
    // failure here can't block sign-out.
    await unregisterForPushNotifications();

    const refreshToken = await getItem(STORAGE_KEYS.refreshToken);
    if (refreshToken) {
      // Best-effort server-side revocation; never block sign-out on it.
      try {
        await api.auth.logout.mutate({ refreshToken });
      } catch {
        // ignore
      }
    }
    await clearSession();
    set({ status: "unauthenticated", user: null });
  },
}));

/** Wipe both the in-memory access token and the persisted refresh token. */
async function clearSession(): Promise<void> {
  setAccessToken(null);
  await deleteItem(STORAGE_KEYS.refreshToken);
}

// Let the tRPC client recover from a 401 by driving the store's refresh.
registerRefreshHandler(() => useAuthStore.getState().refresh());
