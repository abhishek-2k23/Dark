import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, View } from "react-native";

import { Button, Card, Input, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { formatMoney } from "@/utils/format";

type TargetKind = "DUE" | "BOOKING" | "SERVICE_BILL";

/**
 * The peer-to-peer UPI rail.
 *
 * The money never touches us: the resident pays the payee's VPA straight from
 * their own UPI app, then types back the UTR. That reference is evidence, not
 * proof — the resident types it themselves — so for dues and bookings the
 * server holds it for an admin to verify. Service bills settle immediately,
 * because a society admin cannot know whether a resident paid their maid.
 *
 * The deep link only *offers* to open a UPI app. On Android it resolves to the
 * installed apps; on iOS there is no universal handler, so the VPA is always
 * shown as copyable text and the flow works even if nothing opens.
 */
export function UpiPaySheet({
  targetKind,
  targetId,
  onDone,
  onCancel,
}: {
  targetKind: TargetKind;
  targetId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [utr, setUtr] = useState("");
  const [opened, setOpened] = useState(false);

  const intent = trpc.payment.upiIntent.useQuery({ targetKind, targetId });

  const submit = trpc.payment.submitUpiDirect.useMutation({
    onSuccess: (p) => {
      showToast(
        p.status === "SUCCESS"
          ? t("payments.upiRecordedToast")
          : t("payments.upiSubmittedToast"),
        "success",
      );
      void utils.due.list.invalidate();
      void utils.payment.history.invalidate();
      void utils.serviceBill.list.invalidate();
      void utils.amenityBooking.myBookings.invalidate();
      onDone();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  if (intent.isLoading) {
    return (
      <Text variant="bodySmall" color="secondary">
        {t("common.loading")}
      </Text>
    );
  }
  if (intent.error || !intent.data) {
    return (
      <View className="gap-2">
        <Text variant="bodySmall" color="danger">
          {toErrorMessage(intent.error, t)}
        </Text>
        <Button label={t("common.cancel")} variant="ghost" size="sm" onPress={onCancel} />
      </View>
    );
  }

  const { uri, vpa, payeeName, amount } = intent.data;

  const openUpiApp = async () => {
    try {
      const supported = await Linking.canOpenURL(uri);
      if (!supported) {
        // Not a failure: the resident can still pay by typing the VPA into
        // their bank app, which is why it stays on screen.
        showToast(t("payments.upiNoAppToast"), "info");
        setOpened(true);
        return;
      }
      await Linking.openURL(uri);
      setOpened(true);
    } catch {
      showToast(t("payments.upiNoAppToast"), "info");
      setOpened(true);
    }
  };

  return (
    <Card className="gap-3">
      <View className="gap-0.5">
        <Text variant="title">{t("payments.upiPayTo", { name: payeeName })}</Text>
        <Text variant="bodySmall" color="secondary" selectable>
          {vpa}
        </Text>
        <Text variant="h3">{formatMoney(amount)}</Text>
      </View>

      <Text variant="caption" color="tertiary">
        {t("payments.upiExplainer")}
      </Text>

      <Button
        label={t("payments.upiOpenApp")}
        variant="primary"
        size="sm"
        leftIcon="qr-code-outline"
        onPress={openUpiApp}
      />

      {/* The UTR box appears only after they have been sent to pay, so nobody
          is invited to claim a payment they have not made yet. */}
      {opened && (
        <View className="gap-2">
          <Input
            placeholder={t("payments.upiUtrPlaceholder")}
            value={utr}
            onChangeText={setUtr}
            autoCapitalize="characters"
          />
          <Text variant="caption" color="tertiary">
            {targetKind === "SERVICE_BILL"
              ? t("payments.upiServiceDisclaimer")
              : t("payments.upiVerifyDisclaimer")}
          </Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button
          label={t("common.cancel")}
          variant="ghost"
          size="sm"
          className="flex-1"
          onPress={onCancel}
        />
        <Button
          label={t("payments.upiSubmitUtr")}
          variant="success"
          size="sm"
          className="flex-1"
          // A UTR is 12 digits on most PSPs but not all, so this only guards
          // against obviously-empty input rather than enforcing a format the
          // server would have to disagree with.
          disabled={!opened || utr.trim().length < 6}
          loading={submit.isPending}
          onPress={() =>
            submit.mutate({ targetKind, targetId, utr: utr.trim() })
          }
        />
      </View>
    </Card>
  );
}
