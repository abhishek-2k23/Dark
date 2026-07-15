import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button, IconCircle, Screen, Text } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * The gate for a signed-in user who has no society yet — a Google account
 * created before anyone invited its email (see `googleLogin`). They have a
 * valid session but nothing to look at, so every role stack redirects here.
 *
 * "Check again" is a session refresh: the server re-reads the user and claims
 * any invite that now matches their email, so an admin adding them mid-session
 * clears this screen without a sign-out.
 */
export default function NoSocietyScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);

  // Signed out from here, or the refresh below picked up a society — either way
  // this screen no longer applies; let the launch gate re-route.
  if (status === "unauthenticated") return <Redirect href="/(auth)/login" />;
  if (status === "authenticated" && user?.societyId) {
    return <Redirect href="/" />;
  }

  const onCheckAgain = async () => {
    const token = await refresh();
    // A refresh that survives but still has no society means no invite landed
    // yet. If it failed, the store has already signed them out.
    if (token && !useAuthStore.getState().user?.societyId) {
      showToast(t("noSociety.stillNoInvite"), "info");
    }
  };

  return (
    <Screen scroll aurora="hero" contentClassName="grow justify-center gap-6 py-6">
      <View className="items-center gap-4">
        <IconCircle name="mail-unread-outline" tone="warning" size={64} />
        <View className="gap-2">
          <Text variant="h1" className="text-center">
            {t("noSociety.title")}
          </Text>
          <Text variant="body" color="secondary" className="text-center">
            {t("noSociety.body", { email: user?.email ?? "" })}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <Button
          label={t("noSociety.checkAgain")}
          variant="primary"
          onPress={() => void onCheckAgain()}
        />
        <Button
          label={t("noSociety.tryAnother")}
          variant="outline"
          leftIcon="log-out-outline"
          onPress={() => void logout()}
        />
      </View>

      <Text variant="caption" color="tertiary" className="text-center">
        {t("noSociety.hint")}
      </Text>
    </Screen>
  );
}
