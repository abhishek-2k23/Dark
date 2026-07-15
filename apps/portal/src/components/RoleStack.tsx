import { Redirect, Stack } from "expo-router";

import { homeFor } from "@/lib/roles";
import { useAuthStore, type Role } from "@/stores/authStore";

/**
 * Guards a role-specific stack: requires an authenticated user with the given
 * role who belongs to a society. Redirects to the auth stack (signed out), the
 * waiting screen (no society yet) or the caller's own home (wrong role).
 * Shared by the resident / guard / admin layouts.
 */
export function RoleStack({ role: required }: { role: Role }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === "loading") return null;
  if (status === "unauthenticated") return <Redirect href="/(auth)/login" />;
  // Every screen in these stacks reads society-scoped data, so a user without a
  // society can't be let in — the role check alone would pass them through.
  if (!user?.societyId) return <Redirect href="/no-society" />;
  if (user.role !== required) return <Redirect href={homeFor(user)} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
