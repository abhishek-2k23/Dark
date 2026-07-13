import { Redirect, Stack } from "expo-router";

import { roleHome } from "@/lib/roles";
import { useAuthStore, type Role } from "@/stores/authStore";

/**
 * Guards a role-specific stack: requires an authenticated user with the given
 * role, redirecting to the auth stack (signed out) or the caller's own home
 * (wrong role). Shared by the resident / guard / admin layouts.
 */
export function RoleStack({ role: required }: { role: Role }) {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);

  if (status === "loading") return null;
  if (status === "unauthenticated") return <Redirect href="/(auth)/login" />;
  if (role !== required) return <Redirect href={roleHome(role)} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
