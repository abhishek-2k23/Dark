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
 * Email-only account creation. No session is issued here: the server answers
 * with an email-OTP challenge, and the OTP screen (flow=signup) completes the
 * login once the code proves the address — so every account is verified at
 * birth instead of at some random later login.
 */
export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signup = trpc.auth.signup.useMutation({
    onSuccess: (res) => {
      showToast(t("auth.otpSentToast", { email: res.email }), "info");
      router.push({
        pathname: "/(auth)/otp",
        params: { email: res.email, devCode: res.devCode ?? "", flow: "signup" },
      });
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onSubmit = () => {
    if (!name.trim() || !email.trim().includes("@") || password.length < 8) {
      showToast(t("signup.missingFields"), "error");
      return;
    }
    signup.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
    });
  };

  return (
    <Screen scroll aurora="hero" contentClassName="gap-5 pb-6">
      <StackHeader title={t("signup.title")} />

      <Card variant="tonal" className="flex-row items-start gap-3">
        <Icon name="information-circle-outline" size={20} color="primary" />
        <Text variant="bodySmall" color="primary" className="shrink">
          {t("signup.inviteHint")}
        </Text>
      </Card>

      <View className="gap-4">
        <Input
          label={t("signup.name")}
          leftIcon="person-outline"
          placeholder={t("signup.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
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
        <PasswordInput
          label={t("auth.password")}
          leftIcon="lock-closed-outline"
          placeholder={t("signup.passwordHint")}
          value={password}
          onChangeText={setPassword}
          helperText={t("signup.passwordHint")}
        />
      </View>

      <Button
        label={t("signup.cta")}
        variant="primary"
        size="lg"
        rightIcon="arrow-forward"
        loading={signup.isPending}
        onPress={onSubmit}
        fullWidth
      />
    </Screen>
  );
}
