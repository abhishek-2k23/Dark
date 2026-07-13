import { Redirect, Stack } from "expo-router";

import { roleHome } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";

/** Auth stack — bounces already-signed-in users to their role home. */
export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);

  if (status === "authenticated") {
    return <Redirect href={roleHome(role)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
