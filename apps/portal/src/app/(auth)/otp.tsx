import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button, IconCircle, Input, Link, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { toErrorMessage } from "@/utils/errors";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; devCode?: string }>();
  const email = params.email ?? "";
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  // Prefilled from the dev echo when present; empty in real (emailed) flows.
  const [code, setCode] = useState(params.devCode ?? "");

  const verify = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t("auth.welcomeToast"), "success");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const resend = trpc.auth.resendEmailOtp.useMutation({
    onSuccess: (res) => {
      showToast(t("otp.resent"), "info");
      if (res.devCode) setCode(res.devCode);
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onVerify = () => {
    if (code.trim().length < 6) {
      showToast(t("otp.missingCode"), "error");
      return;
    }
    verify.mutate({ email, code: code.trim() });
  };

  return (
    <Screen scroll aurora="hero" contentClassName="gap-6 py-6">
      <View className="items-center pt-6">
        <IconCircle name="mail-unread-outline" tone="primary" size={64} />
      </View>

      <View className="gap-1">
        <Text variant="h1">{t("otp.title")}</Text>
        <Text variant="bodyLarge" color="secondary">
          {t("otp.subtitle", { email })}
        </Text>
      </View>

      <Input
        label={t("otp.codeLabel")}
        leftIcon="keypad-outline"
        placeholder="••••••"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={onVerify}
        returnKeyType="go"
        style={{ letterSpacing: 6, fontSize: 20 }}
      />

      <Button
        label={t("otp.verify")}
        variant="primary"
        size="lg"
        loading={verify.isPending}
        onPress={onVerify}
        fullWidth
      />

      <View className="flex-row items-center justify-center gap-1">
        <Link
          label={t("otp.resend")}
          onPress={() => resend.mutate({ email })}
        />
      </View>

      <View className="items-center">
        <Link
          label={t("otp.back")}
          leftIcon="chevron-back"
          color="secondary"
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}
