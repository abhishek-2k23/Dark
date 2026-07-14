import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Icon, Input, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { toErrorMessage } from "@/utils/errors";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const showToast = useUIStore((s) => s.showToast);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const signup = trpc.auth.signup.useMutation({
    onSuccess: async (session) => {
      await setSession(session);
      showToast(t("signup.welcome"), "success");
      // First login → collect emergency contact before landing on the dashboard.
      router.replace("/(resident)/profile-setup");
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onSubmit = () => {
    if (!name.trim() || (!email.trim() && !phone.trim()) || password.length < 8) {
      showToast(t("signup.missingFields"), "error");
      return;
    }
    signup.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      password,
    });
  };

  return (
    <Screen scroll contentClassName="gap-5 pb-6">
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
          labelHint={t("signup.oneRequired")}
          leftIcon="mail-outline"
          placeholder="you@email.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          label={t("signup.phone")}
          labelHint={t("signup.oneRequired")}
          leftIcon="call-outline"
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Input
          label={t("auth.password")}
          leftIcon="lock-closed-outline"
          placeholder={t("signup.passwordHint")}
          secureTextEntry
          autoCapitalize="none"
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
