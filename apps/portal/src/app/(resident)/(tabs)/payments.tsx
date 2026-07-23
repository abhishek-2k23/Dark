import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { ImageField } from "@/components/media";
import { TabPage } from "@/components/TabPage";
import {
  Badge,
  Button,
  Card,
  Input,
  GlassCard,
  Icon,
  IconCircle,
  Screen,
  SwipeTabs,
  Text,
  type IconName,
} from "@/components/ui";
import { UpiPaySheet } from "@/components/UpiPaySheet";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { dueStatusTone, paymentStatusTone } from "@/utils/domain";
import { formatDate, formatDateTime, formatMoney, MONTH_KEYS } from "@/utils/format";

const METHODS: { value: "UPI" | "CARD" | "NETBANKING"; icon: IconName }[] = [
  { value: "UPI", icon: "qr-code-outline" },
  { value: "CARD", icon: "card-outline" },
  { value: "NETBANKING", icon: "globe-outline" },
];

/**
 * Which rails to offer for one due.
 *
 * Asks the server rather than guessing: the gateway is only open once the
 * society's Razorpay linked account is ACTIVE, and UPI only once it has
 * published a VPA. Rendering a method the server would reject is how residents
 * end up staring at a 412. Offline is always available, so this never renders
 * an empty row even while the query is in flight.
 */
function DueActions({
  dueId,
  onGateway,
  onUpi,
  onOffline,
}: {
  dueId: string;
  onGateway: () => void;
  onUpi: () => void;
  onOffline: () => void;
}) {
  const { t } = useTranslation();
  const options = trpc.payment.options.useQuery({ targetKind: "DUE", targetId: dueId });

  return (
    <View className="flex-row flex-wrap gap-2">
      {options.data?.gateway && (
        <Button
          label={t("payments.payNow")}
          variant="primary"
          size="sm"
          className="flex-1"
          onPress={onGateway}
        />
      )}
      {options.data?.upiDirect && (
        <Button
          label={t("payments.payByUpi")}
          variant="primary"
          size="sm"
          leftIcon="qr-code-outline"
          className="flex-1"
          onPress={onUpi}
        />
      )}
      {/* For dues settled at the office by cash or cheque — the receipt is a
          claim an admin still has to verify. */}
      <Button
        label={t("payments.paidOffline")}
        variant="outline"
        size="sm"
        leftIcon="receipt-outline"
        className="flex-1"
        onPress={onOffline}
      />
    </View>
  );
}

function DuesList() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [offlineId, setOfflineId] = useState<string | null>(null);
  const [upiId, setUpiId] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"UPI" | "CARD" | "NETBANKING">("UPI");

  const q = trpc.due.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const initiate = trpc.payment.initiate.useMutation({
    onSuccess: (res) => {
      showToast(
        t("payments.initiatedToast", { orderId: res.gateway.orderId }),
        "success",
      );
      setPayingId(null);
      void utils.due.list.invalidate();
      void utils.payment.history.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const submitOffline = trpc.payment.submitOffline.useMutation({
    onSuccess: () => {
      showToast(t("payments.receiptSubmittedToast"), "success");
      setOfflineId(null);
      setReceiptUrl(null);
      setNote("");
      void utils.due.list.invalidate();
      void utils.payment.history.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return (
      <EmptyState
        icon="checkmark-done-outline"
        title={t("payments.noDues")}
        body={t("payments.noDuesBody")}
      />
    );

  const outstanding = items
    .filter((d) => d.status === "PENDING" || d.status === "OVERDUE")
    .reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <View className="gap-3">
      {outstanding > 0 && (
        <GlassCard variant="neon" padding="lg" className="gap-1">
          <Text variant="overline" color="secondary">
            {t("payments.dues")}
          </Text>
          <Text variant="h1">{formatMoney(outstanding)}</Text>
          <Text variant="bodySmall" color="secondary">
            {t("payments.subtitle")}
          </Text>
        </GlassCard>
      )}
      {items.map((d) => {
        const payable = d.status === "PENDING" || d.status === "OVERDUE";
        const paying = payingId === d.id;
        const offline = offlineId === d.id;
        const upi = upiId === d.id;
        return (
          <Card key={d.id} className="gap-3">
            <View className="flex-row items-center gap-3">
              <IconCircle
                name="wallet-outline"
                tone={d.status === "OVERDUE" ? "danger" : "primary"}
                size={44}
              />
              <View className="flex-1 gap-0.5">
                <Text variant="title">
                  {t(`months.${MONTH_KEYS[d.month - 1]}`)} {d.year}
                </Text>
                <Text variant="bodySmall" color="secondary">
                  {t("payments.dueBy", { date: formatDate(d.dueDate) })}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text variant="title">{formatMoney(d.amount)}</Text>
                <Badge
                  label={t(`enums.dueStatus.${d.status}`)}
                  tone={dueStatusTone[d.status] ?? "neutral"}
                  uppercase
                  size="sm"
                />
              </View>
            </View>

            {payable && !paying && !offline && !upi && (
              <DueActions
                dueId={d.id}
                onGateway={() => setPayingId(d.id)}
                onUpi={() => setUpiId(d.id)}
                onOffline={() => {
                  setOfflineId(d.id);
                  setReceiptUrl(null);
                  setNote("");
                }}
              />
            )}

            {upi && (
              <UpiPaySheet
                targetKind="DUE"
                targetId={d.id}
                onDone={() => setUpiId(null)}
                onCancel={() => setUpiId(null)}
              />
            )}

            {offline && (
              <View className="gap-3">
                <ImageField
                  value={receiptUrl}
                  onChange={setReceiptUrl}
                  kind="RECEIPT"
                  label={t("payments.receipt")}
                  hint={t("payments.receiptHint")}
                  aspect={[4, 3]}
                  contentFit="contain"
                />
                <Input
                  placeholder={t("payments.notePlaceholder")}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  style={{ minHeight: 56, textAlignVertical: "top" }}
                />
                <Text variant="caption" color="tertiary">
                  {t("payments.offlineDisclaimer")}
                </Text>
                <View className="flex-row gap-2">
                  <Button
                    label={t("common.cancel")}
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onPress={() => setOfflineId(null)}
                  />
                  <Button
                    label={t("payments.submitReceipt")}
                    variant="success"
                    size="sm"
                    className="flex-1"
                    disabled={!receiptUrl}
                    loading={submitOffline.isPending}
                    onPress={() => {
                      if (!receiptUrl) return;
                      submitOffline.mutate({
                        targetKind: "DUE",
                        targetId: d.id,
                        receiptUrl,
                        note: note.trim() || undefined,
                      });
                    }}
                  />
                </View>
              </View>
            )}

            {paying && (
              <View className="gap-3">
                <View className="flex-row gap-2">
                  {METHODS.map((m) => {
                    const active = m.value === method;
                    return (
                      <Pressable
                        key={m.value}
                        onPress={() => setMethod(m.value)}
                        className={`flex-1 items-center gap-1 rounded-xl border px-2 py-2.5 active:opacity-80 ${
                          active
                            ? "border-primary bg-primary-soft"
                            : "border-border bg-surface"
                        }`}
                      >
                        <Icon
                          name={m.icon}
                          size={18}
                          color={active ? "primary" : "secondary"}
                        />
                        <Text
                          variant="caption"
                          color={active ? "primary" : "secondary"}
                        >
                          {t(`enums.paymentMethod.${m.value}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View className="flex-row gap-2">
                  <Button
                    label={t("common.cancel")}
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onPress={() => setPayingId(null)}
                  />
                  <Button
                    label={t("payments.confirmPay", {
                      amount: formatMoney(d.amount),
                    })}
                    variant="success"
                    size="sm"
                    className="flex-1"
                    loading={initiate.isPending}
                    onPress={() =>
                      initiate.mutate({ targetKind: "DUE", targetId: d.id, method })
                    }
                  />
                </View>
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
  );
}

function PaymentHistory() {
  const { t } = useTranslation();
  const q = trpc.payment.history.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return <EmptyState icon="receipt-outline" title={t("payments.noHistory")} />;

  return (
    <View className="gap-3">
      {items.map((p) => (
        <Card key={p.id} className="flex-row items-center gap-3">
          <IconCircle name="receipt-outline" tone="neutral" size={44} />
          <View className="flex-1 gap-0.5">
            <Text variant="title">
              {/* History spans dues, bookings and service bills now. Dues keep
                  their familiar "July 2026" heading; anything else falls back
                  to the server's label, which already reads correctly. */}
              {p.dueMonth !== null && p.dueYear !== null
                ? `${t(`months.${MONTH_KEYS[p.dueMonth - 1]}`)} ${p.dueYear}`
                : p.targetLabel}
            </Text>
            <Text variant="bodySmall" color="secondary" numberOfLines={1}>
              {t(`enums.paymentMethod.${p.method}`)} ·{" "}
              {formatDateTime(p.paidAt ?? p.createdAt)}
            </Text>
            {p.transactionId && (
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {p.transactionId}
              </Text>
            )}
          </View>
          <View className="items-end gap-1">
            <Text variant="title">{formatMoney(p.amount)}</Text>
            <Badge
              label={t(`enums.paymentStatus.${p.status}`)}
              tone={paymentStatusTone[p.status] ?? "neutral"}
              uppercase
              size="sm"
            />
          </View>
        </Card>
      ))}
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
  );
}

export default function PaymentsTab() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"dues" | "history">("dues");

  return (
    <Screen padded={false} contentClassName="pt-3">
      <View className="px-5">
        <Text variant="h1">{t("payments.title")}</Text>
        <Text variant="body" color="secondary">
          {t("payments.subtitle")}
        </Text>
      </View>
      <SwipeTabs
        value={tab}
        onChange={setTab}
        tabsClassName="mx-5 mb-1 mt-4"
        options={[
          { value: "dues", label: t("payments.dues") },
          { value: "history", label: t("payments.history") },
        ]}
      >
        <TabPage>
          <DuesList />
        </TabPage>
        <TabPage>
          <PaymentHistory />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
