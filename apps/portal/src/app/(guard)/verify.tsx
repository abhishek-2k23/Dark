import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  IconCircle,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

export default function VerifyPass() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");

  const verify = trpc.guestPreApproval.verify.useMutation({
    onSuccess: (res) => {
      showToast(t("guard.verifiedToast", { name: res.visitor.name }), "success");
      void utils.visitor.history.invalidate();
      router.replace(`/(guard)/visitors/${res.visitor.id}`);
    },
    onError: (e) => showToast(e.message, "error"),
  });

  return (
    <Screen scroll contentClassName="gap-5 pb-8">
      <StackHeader title={t("guard.verifyPass")} />

      <View className="items-center gap-3 pt-2">
        <IconCircle name="qr-code-outline" tone="accent" size={64} />
        <Text variant="body" color="secondary" align="center" className="px-4">
          {t("guard.verifySubtitle")}
        </Text>
      </View>

      <Card className="gap-4">
        <Input
          label={t("guard.passCode")}
          leftIcon="key-outline"
          placeholder={t("guard.passCodePlaceholder")}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          label={t("guard.verifyCta")}
          variant="primary"
          size="lg"
          leftIcon="scan-outline"
          loading={verify.isPending}
          onPress={() => {
            if (!code.trim()) {
              showToast(t("guard.missingCode"), "error");
              return;
            }
            verify.mutate({ qrCode: code.trim() });
          }}
          fullWidth
        />
      </Card>
    </Screen>
  );
}
