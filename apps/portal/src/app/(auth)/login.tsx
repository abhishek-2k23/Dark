import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  Button,
  Divider,
  GlassCard,
  IconCircle,
  Input,
  Link,
  PasswordInput,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useGoogleSignIn } from "@/lib/useGoogleSignIn";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: async (res) => {
      if (res.status === "SUCCESS") {
        await setSession(res.session);
        showToast(t("auth.welcomeToast"), "success");
      } else {
        // Unverified email → confirm the OTP on the next screen.
        showToast(t("auth.otpSentToast", { email: res.email }), "info");
        router.push({
          pathname: "/(auth)/otp",
          params: { email: res.email, devCode: res.devCode ?? "" },
        });
      }
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const googleLogin = trpc.auth.googleLogin.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t("auth.welcomeToast"), "success");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const google = useGoogleSignIn(
    (idToken) => googleLogin.mutate({ idToken }),
    (key) => showToast(t(key), "error"),
  );

  const onSubmit = () => {
    if (!identifier.trim() || !password) {
      showToast(t("auth.missingFields"), "error");
      return;
    }
    login.mutate({ identifier: identifier.trim(), password });
  };

  const onGoogle = () => {
    if (!google.available) {
      showToast(t("auth.googleUnavailable"), "info");
      return;
    }
    void google.promptAsync();
  };

  return (
    <Screen scroll aurora="hero" contentClassName="gap-6 py-6">
      {/* Brand */}
      <View className="items-center gap-3 pt-4">
        <IconCircle name="business" tone="primary" size={64} />
        <View className="items-center gap-0.5">
          <Text variant="h2" color="primary">
            {t("app.name")}
          </Text>
          <Text variant="overline" color="secondary">
            {t("app.brandline")}
          </Text>
        </View>
      </View>

      <View className="gap-1">
        <Text variant="display">{t("auth.welcomeBack")}</Text>
        <Text variant="bodyLarge" color="secondary">
          {t("auth.mobilePrompt")}
        </Text>
      </View>

      <GlassCard variant="hero" padding="lg" className="gap-5">
        <Input
          label={t("auth.identifier")}
          leftIcon="person-outline"
          placeholder={t("auth.identifierPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <PasswordInput
          label={t("auth.password")}
          leftIcon="lock-closed-outline"
          placeholder={t("auth.passwordPlaceholder")}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
          returnKeyType="go"
        />
        <Button
          label={t("auth.logIn")}
          variant="primary"
          size="lg"
          rightIcon="arrow-forward"
          loading={login.isPending}
          onPress={onSubmit}
          fullWidth
        />
      </GlassCard>

      {/* Divider */}
      <View className="flex-row items-center gap-3">
        <Divider className="flex-1" />
        <Text variant="overline" color="tertiary">
          {t("auth.orContinueWith")}
        </Text>
        <Divider className="flex-1" />
      </View>

      <Button
        label={t("auth.continueWithGoogle")}
        variant="outline"
        size="lg"
        leftIcon="logo-google"
        loading={googleLogin.isPending}
        onPress={onGoogle}
        fullWidth
      />

      {/* Secondary actions */}
      <View className="flex-row items-center justify-center gap-6">
        <Link
          label={t("auth.forgotPassword")}
          size="sm"
          onPress={() => router.push("/(auth)/forgot-password")}
        />
        <Link
          label={t("auth.createAccount")}
          size="sm"
          onPress={() => router.push("/(auth)/signup")}
        />
      </View>

      <Link
        label={t("auth.registerSocietyLink")}
        size="sm"
        leftIcon="business-outline"
        className="justify-center"
        onPress={() => router.push("/(auth)/register-society")}
      />

      {/* Footer */}
      <View className="mt-2 flex-row flex-wrap items-center justify-center gap-x-1">
        <Text variant="caption" color="tertiary">
          {t("auth.agreePrefix")}
        </Text>
        <Link label={t("auth.terms")} size="sm" />
        <Text variant="caption" color="tertiary">
          {t("auth.and")}
        </Text>
        <Link label={t("auth.privacy")} size="sm" />
      </View>
    </Screen>
  );
}
