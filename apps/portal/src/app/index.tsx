import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { roleHome } from "@/lib/roles";
import { useAuthStore } from "@/stores/authStore";
import { useTheme } from "@/theme";

/**
 * Launch gate. Waits for the auth store to hydrate, then routes to the auth
 * stack or the signed-in user's role-specific stack.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role);
  const { colors } = useTheme();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={roleHome(role)} />;
}
