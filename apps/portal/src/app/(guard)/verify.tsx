import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { PassScanner } from "@/components/PassScanner";
import { StackHeader } from "@/components/StackHeader";
import {
  Button,
  Card,
  Divider,
  IconCircle,
  Input,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { normalisePassCode, PASS_CODE_LENGTH } from "@/utils/domain";

export default function VerifyPass() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [scanning, setScanning] = useState(false);

  // A tapped PRE_APPROVAL_CREATED push (or a row in the gate queue) lands here
  // with the code already in hand, so seed the field from it. Deliberately
  // prefill-only, not auto-verify: verifying burns the pass, and a guard who
  // tapped a notification to read it should not have spent it by doing so.
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalisePassCode(codeParam ?? ""));

  const verify = trpc.guestPreApproval.verify.useMutation({
    onSuccess: (res) => {
      showToast(t("guard.verifiedToast", { name: res.visitor.name }), "success");
      void utils.visitor.history.invalidate();
      void utils.guestPreApproval.invalidate();
      router.replace(`/(guard)/visitors/${res.visitor.id}`);
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const submit = (raw: string) => {
    const value = normalisePassCode(raw);
    if (!value) {
      showToast(t("guard.missingCode"), "error");
      return;
    }
    verify.mutate({ qrCode: value });
  };

  const complete = normalisePassCode(code).length === PASS_CODE_LENGTH;

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
        {/* Scanning is the fast path and reads first; typing is the fallback
            for a torn printout or a dead guest phone. */}
        <Button
          label={t("guard.scanCta")}
          variant="primary"
          size="lg"
          leftIcon="scan-outline"
          onPress={() => setScanning(true)}
          disabled={verify.isPending}
          fullWidth
        />

        {/* Divider is `w-full`, so the flexing happens on a wrapper rather than
            by fighting that class from the outside. */}
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Divider />
          </View>
          <Text variant="caption" color="tertiary">
            {t("guard.orTypeIt")}
          </Text>
          <View className="flex-1">
            <Divider />
          </View>
        </View>

        <Input
          label={t("guard.passCode")}
          leftIcon="key-outline"
          placeholder={t("guard.passCodePlaceholder")}
          value={code}
          // Normalise as they type so the field always shows the canonical form
          // — what they read back matches what is printed on the pass.
          onChangeText={(text) => setCode(normalisePassCode(text))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={PASS_CODE_LENGTH}
          style={{ fontFamily: "monospace", letterSpacing: 3 }}
          helperText={t("guard.passCodeHelp")}
          returnKeyType="go"
          onSubmitEditing={() => submit(code)}
        />
        <Button
          label={t("guard.verifyCta")}
          variant={complete ? "primary" : "secondary"}
          size="lg"
          leftIcon="checkmark-circle-outline"
          loading={verify.isPending}
          onPress={() => submit(code)}
          fullWidth
        />
      </Card>

      <PassScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(value) => {
          const scanned = normalisePassCode(value);
          setCode(scanned);
          submit(scanned);
        }}
      />
    </Screen>
  );
}
