import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Loading } from "@/components/ListState";
import {
  Button,
  Card,
  IconCircle,
  Input,
  Link,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";

/**
 * The gate for a signed-in user who has no society yet (uninvited signup or
 * Google login). From here they can ask a society to let them in by naming
 * its admin's email; the admin approves or rejects from their queue.
 *
 * "Check again" is a session refresh: the server re-reads the user, so an
 * approval or an admin invite landing mid-session clears this screen without
 * a sign-out.
 */
export default function NoSocietyScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [adminEmail, setAdminEmail] = useState("");

  const mine = trpc.joinRequest.mine.useQuery(undefined, {
    enabled: status === "authenticated" && !user?.societyId,
    // While an answer is pending, poll so the approval lands without anyone
    // pressing "Check again" — the push notification usually beats this, but
    // polling covers denied notification permissions and silent failures.
    refetchInterval: (q) =>
      q.state.data?.status === "PENDING" ? 20_000 : false,
  });

  // The poll (or a refetch) saw the approval — only a session refresh carries
  // the new societyId into the auth store, and that is what redirects below.
  const approved = mine.data?.status === "APPROVED";
  useEffect(() => {
    if (approved && !user?.societyId) void refresh();
  }, [approved, user?.societyId, refresh]);

  const submit = trpc.joinRequest.submit.useMutation({
    onSuccess: () => {
      // Deliberately vague: the server never confirms whether the email
      // matched an admin, and neither do we.
      showToast(t("noSociety.requestSubmitted"), "success");
      setAdminEmail("");
      void utils.joinRequest.mine.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  // Signed out from here, or a refresh picked up a society — either way this
  // screen no longer applies.
  if (status === "unauthenticated") return <Redirect href="/(auth)/login" />;
  if (status === "authenticated" && user?.societyId) {
    // An approval or invite just landed. Residents get walked through
    // profile-setup (photo + emergency contact) before the dashboard — this is
    // their real "first login" moment; other roles go straight home.
    return (
      <Redirect
        href={user.role === "RESIDENT" ? "/(resident)/profile-setup" : "/"}
      />
    );
  }

  const onCheckAgain = async () => {
    const token = await refresh();
    if (token && !useAuthStore.getState().user?.societyId) {
      showToast(t("noSociety.stillNoInvite"), "info");
      void utils.joinRequest.mine.invalidate();
    }
  };

  const onSubmit = () => {
    const email = adminEmail.trim();
    if (!email.includes("@")) {
      showToast(t("noSociety.badEmail"), "error");
      return;
    }
    submit.mutate({ adminEmail: email });
  };

  const request = mine.data;
  const pending = request?.status === "PENDING";
  const inCooldown =
    request?.status === "EXPIRED" &&
    !!request.canRequestAgainAt &&
    new Date(request.canRequestAgainAt) > new Date();

  return (
    <Screen scroll aurora="hero" contentClassName="grow justify-center gap-5 py-6">
      <View className="items-center gap-4">
        <IconCircle name="home-outline" tone="primary" size={64} />
        <View className="gap-2">
          <Text variant="h1" className="text-center">
            {t("noSociety.title")}
          </Text>
          <Text variant="body" color="secondary" className="text-center">
            {t("noSociety.body", { email: user?.email ?? "" })}
          </Text>
        </View>
      </View>

      {mine.isLoading ? (
        <Loading className="py-4" />
      ) : (
        <>
          {/* The latest request's fate, told honestly — it's the caller's own. */}
          {request?.status === "PENDING" && (
            <Card variant="tonal" className="gap-1.5">
              <Text variant="title">{t("noSociety.pendingTitle")}</Text>
              <Text variant="bodySmall" color="secondary">
                {t("noSociety.pendingBody", {
                  society: request.societyName,
                  time: formatDateTime(request.expiresAt),
                })}
              </Text>
            </Card>
          )}
          {request?.status === "EXPIRED" && (
            <Card variant="tonal" className="gap-1.5">
              <Text variant="title">{t("noSociety.expiredTitle")}</Text>
              <Text variant="bodySmall" color="secondary">
                {t("noSociety.expiredBody", { society: request.societyName })}
                {inCooldown &&
                  ` ${t("noSociety.retryAt", {
                    time: formatDateTime(request.canRequestAgainAt!),
                  })}`}
              </Text>
            </Card>
          )}
          {request?.status === "REJECTED" && (
            <Card variant="tonal" className="gap-1.5">
              <Text variant="title">{t("noSociety.rejectedTitle")}</Text>
              <Text variant="bodySmall" color="secondary">
                {t("noSociety.rejectedBody", { society: request.societyName })}
              </Text>
            </Card>
          )}

          {/* One live request at a time; otherwise the form is always open —
              a rejected or cooling-down user may still ask a DIFFERENT society. */}
          {!pending && (
            <Card className="gap-4">
              <View className="gap-1">
                <Text variant="title">{t("noSociety.joinTitle")}</Text>
                <Text variant="bodySmall" color="secondary">
                  {t("noSociety.joinBody")}
                </Text>
              </View>
              <Input
                leftIcon="mail-outline"
                placeholder={t("noSociety.adminEmailPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={adminEmail}
                onChangeText={setAdminEmail}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
              />
              <Button
                label={t("noSociety.requestCta")}
                variant="primary"
                leftIcon="paper-plane-outline"
                loading={submit.isPending}
                onPress={onSubmit}
                fullWidth
              />
            </Card>
          )}
        </>
      )}

      <View className="gap-3">
        <Button
          label={t("noSociety.checkAgain")}
          variant={pending ? "primary" : "outline"}
          onPress={() => void onCheckAgain()}
        />
        <Link
          label={t("noSociety.tryAnother")}
          size="sm"
          leftIcon="log-out-outline"
          className="justify-center"
          onPress={() => void logout()}
        />
      </View>

      <Text variant="caption" color="tertiary" className="text-center">
        {t("noSociety.hint")}
      </Text>
    </Screen>
  );
}
