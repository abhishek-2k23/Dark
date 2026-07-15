import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Icon,
  Input,
  PasswordInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { toErrorMessage } from "@/utils/errors";
import { useUIStore } from "@/stores/uiStore";

/**
 * Two-step reset: request a token by email, then confirm with token + new
 * password. Email delivery is log-stubbed on the dev server, so the hint card
 * tells developers where to find the token.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);

  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      showToast(t("reset.sent"), "success");
      setStep("confirm");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const confirm = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      showToast(t("reset.done"), "success");
      router.back();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  return (
    <Screen scroll contentClassName="gap-5 pb-6">
      <StackHeader title={t("reset.title")} />

      {step === "request" ? (
        <>
          <Text variant="body" color="secondary">
            {t("reset.requestHint")}
          </Text>
          <Input
            label={t("signup.email")}
            leftIcon="mail-outline"
            placeholder="you@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button
            label={t("reset.requestCta")}
            variant="primary"
            size="lg"
            loading={request.isPending}
            onPress={() => {
              if (!email.trim()) return showToast(t("reset.missingEmail"), "error");
              request.mutate({ email: email.trim() });
            }}
            fullWidth
          />
        </>
      ) : (
        <>
          <Card variant="tonal" className="flex-row items-start gap-3">
            <Icon name="terminal-outline" size={20} color="primary" />
            <Text variant="bodySmall" color="primary" className="shrink">
              {t("reset.devHint")}
            </Text>
          </Card>
          <View className="gap-4">
            <Input
              label={t("reset.token")}
              leftIcon="key-outline"
              placeholder={t("reset.tokenPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
            />
            <PasswordInput
              label={t("reset.newPassword")}
              leftIcon="lock-closed-outline"
              placeholder={t("signup.passwordHint")}
              value={newPassword}
              onChangeText={setNewPassword}
            />
          </View>
          <Button
            label={t("reset.confirmCta")}
            variant="primary"
            size="lg"
            loading={confirm.isPending}
            onPress={() => {
              if (!token.trim() || newPassword.length < 8)
                return showToast(t("reset.missingConfirm"), "error");
              confirm.mutate({ token: token.trim(), newPassword });
            }}
            fullWidth
          />
        </>
      )}
    </Screen>
  );
}
