import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  Link,
  Screen,
  Text,
} from "./ui";

const ROLE_LABEL: Record<string, string> = {
  RESIDENT: "Resident",
  GUARD: "Security Guard",
  ADMIN: "Society Admin",
};

/**
 * Temporary signed-in home for each role. Confirms the auth → role-redirect →
 * logout loop works end-to-end; the real dashboards land in Phases 13–15.
 */
export function PlaceholderHome() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    setBusy(true);
    await logout();
    showToast("Signed out", "info");
    // The role stack's guard redirects to the auth stack once unauthenticated.
  };

  return (
    <Screen scroll contentClassName="gap-6 py-4">
      <View className="flex-row items-center gap-3">
        <Avatar uri={user?.avatarUrl} name={user?.name} size={48} />
        <View className="shrink">
          <Text variant="bodySmall" color="secondary">
            Welcome back
          </Text>
          <Text variant="h2">{user?.name ?? "—"}</Text>
        </View>
      </View>

      <Card variant="outlined" className="gap-3">
        <View className="flex-row items-center justify-between">
          <Badge
            label={ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? "—"}
            tone="primary"
          />
          <Icon name="checkmark-circle" size={20} color="success" />
        </View>
        <Text variant="body" color="secondary">
          You're signed in. The full {ROLE_LABEL[user?.role ?? ""] ?? "role"}{" "}
          experience arrives in the next phases.
        </Text>
        <View className="gap-0.5">
          {user?.email && (
            <Text variant="caption" color="tertiary">
              {user.email}
            </Text>
          )}
          {user?.phone && (
            <Text variant="caption" color="tertiary">
              {user.phone}
            </Text>
          )}
        </View>
      </Card>

      <Link
        label="Open design system showcase"
        rightIcon="arrow-forward"
        onPress={() => router.push("/(dev)/showcase")}
      />

      <Button
        label="Log out"
        variant="outline"
        leftIcon="log-out-outline"
        loading={busy}
        onPress={onLogout}
        fullWidth
      />
    </Screen>
  );
}
