import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { PhotoStrip } from "@/components/media";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Button, Card, Input, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { formatDateTime, formatMoney } from "@/utils/format";

/**
 * The admin queue for payments residents say they made offline. Each row is a
 * claim backed by a receipt photo: approving settles the due, rejecting sends
 * it back with a reason. Oldest first — the longest wait is the closest to
 * going overdue.
 */
export default function VerifyPayments() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const showDialog = useUIStore((s) => s.showDialog);
  const utils = trpc.useUtils();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const q = trpc.payment.pending.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const decide = trpc.payment.decide.useMutation({
    onSuccess: (p) => {
      showToast(
        p.status === "SUCCESS" ? t("admin.receiptVerified") : t("admin.receiptRejected"),
        p.status === "SUCCESS" ? "success" : "info",
      );
      setRejectingId(null);
      setReason("");
      void utils.payment.pending.invalidate();
      void utils.due.list.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const onApprove = (paymentId: string, amount: number) => {
    // Approving marks a due paid on someone's word plus a photo — worth one
    // deliberate tap, since undoing it means a manual DB fix.
    showDialog({
      title: t("admin.verifyReceipt"),
      message: t("admin.verifyReceiptConfirm", { amount: formatMoney(amount) }),
      actions: [
        {
          label: t("admin.verify"),
          tone: "primary",
          onPress: () => decide.mutate({ paymentId, approve: true }),
        },
        { label: t("common.cancel"), tone: "neutral" },
      ],
    });
  };

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("admin.verifyPayments")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={toErrorMessage(q.error, t)} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t("admin.noReceipts")}
          body={t("admin.noReceiptsBody")}
        />
      ) : (
        <View className="gap-3">
          {items.map((p) => {
            const rejecting = rejectingId === p.id;
            return (
              <Card key={p.id} className="gap-3">
                <View className="flex-row items-start gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text variant="title">{p.residentName}</Text>
                    <Text variant="bodySmall" color="secondary">
                      {t("guard.flatLine", { tower: p.towerName, flat: p.flatNumber })}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {/* The queue now carries dues, bookings and service bills,
                          so the server's own label is the only thing that reads
                          correctly for all three. */}
                      {p.targetLabel} · {formatDateTime(p.createdAt)}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {p.method === "UPI_DIRECT"
                        ? t("admin.paidByUpi", { utr: p.upiUtr ?? "—" })
                        : t("admin.paidOffline")}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text variant="title" color="primary">
                      {formatMoney(p.amount)}
                    </Text>
                    <Badge
                      label={t(`enums.paymentMethod.${p.method}`)}
                      tone="warning"
                      size="sm"
                    />
                  </View>
                </View>

                {p.note && (
                  <Text variant="bodySmall" color="secondary">
                    “{p.note}”
                  </Text>
                )}

                {/* Tap to open full-screen — small print on a receipt is the
                    whole basis for the decision. */}
                {p.receiptUrl && (
                  <PhotoStrip urls={[p.receiptUrl]} label={t("payments.receipt")} size={96} />
                )}

                {rejecting ? (
                  <View className="gap-2">
                    <Input
                      placeholder={t("admin.rejectReasonPlaceholder")}
                      value={reason}
                      onChangeText={setReason}
                      multiline
                      style={{ minHeight: 52, textAlignVertical: "top" }}
                    />
                    <View className="flex-row gap-2">
                      <Button
                        label={t("common.cancel")}
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                        onPress={() => setRejectingId(null)}
                      />
                      <Button
                        label={t("admin.confirmReject")}
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        loading={decide.isPending}
                        onPress={() =>
                          decide.mutate({
                            paymentId: p.id,
                            approve: false,
                            rejectionReason: reason.trim() || undefined,
                          })
                        }
                      />
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-2">
                    <Button
                      label={t("admin.reject")}
                      variant="outline"
                      size="sm"
                      leftIcon="close-circle-outline"
                      className="flex-1"
                      onPress={() => {
                        setRejectingId(p.id);
                        setReason("");
                      }}
                    />
                    <Button
                      label={t("admin.verify")}
                      variant="success"
                      size="sm"
                      leftIcon="checkmark-circle-outline"
                      className="flex-1"
                      loading={decide.isPending}
                      onPress={() => onApprove(p.id, p.amount)}
                    />
                  </View>
                )}
              </Card>
            );
          })}

          {q.hasNextPage && (
            <Button
              label={t("common.loadMore")}
              variant="ghost"
              size="sm"
              loading={q.isFetchingNextPage}
              onPress={() => q.fetchNextPage()}
            />
          )}
        </View>
      )}
    </Screen>
  );
}
