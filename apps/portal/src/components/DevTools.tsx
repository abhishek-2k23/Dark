import { useRouter } from "expo-router";
import { View } from "react-native";

import { Button, Text } from "@/components/ui";
import { sendTestNotification } from "@/lib/push";

/**
 * Dev-only shortcuts surfaced on the profile tab (every role has one), so the
 * test tools stay reachable now that the old PlaceholderHome entry point is
 * gone. Renders nothing in a production build.
 */
export function DevTools() {
  const router = useRouter();
  if (!__DEV__) return null;

  return (
    <View className="gap-2.5">
      <Text variant="label" color="secondary">
        Developer
      </Text>
      <Button
        label="Send test notification"
        variant="outline"
        leftIcon="notifications-outline"
        onPress={() =>
          void sendTestNotification({
            title: "Test notification",
            body: "If you can see this, the notification handler works.",
            data: { type: "GENERAL" },
          })
        }
      />
      <Button
        label="Design system & more tests"
        variant="ghost"
        size="sm"
        rightIcon="chevron-forward"
        onPress={() => router.push("/(dev)/showcase")}
      />
    </View>
  );
}
