import { Redirect, Stack } from "expo-router";

import { homeFor } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";

/** Auth stack — bounces already-signed-in users to their home. */
export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === "authenticated") {
    return <Redirect href={homeFor(user ?? undefined)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
