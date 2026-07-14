import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  Screen,
  SegmentedControl,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { dueStatusTone, paymentStatusTone } from "@/utils/domain";
import { formatDate, formatDateTime, formatMoney, MONTH_KEYS } from "@/utils/format";

const METHODS: { value: "UPI" | "CARD" | "NETBANKING"; icon: IconName }[] = [
  { value: "UPI", icon: "qr-code-outline" },
  { value: "CARD", icon: "card-outline" },
  { value: "NETBANKING", icon: "globe-outline" },
];

function DuesList() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [payingId, setPayingId] = useState<string | null>(null);
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

  return (
    <View className="gap-3">
      {items.map((d) => {
        const payable = d.status === "PENDING" || d.status === "OVERDUE";
        const paying = payingId === d.id;
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

            {payable && !paying && (
              <Button
                label={t("payments.payNow")}
                variant="primary"
                size="sm"
                onPress={() => setPayingId(d.id)}
              />
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
                    onPress={() => initiate.mutate({ dueId: d.id, method })}
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
              {t(`months.${MONTH_KEYS[p.dueMonth - 1]}`)} {p.dueYear}
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
    <Screen scroll contentClassName="gap-4 py-3 pb-8">
      <View>
        <Text variant="h1">{t("payments.title")}</Text>
        <Text variant="body" color="secondary">
          {t("payments.subtitle")}
        </Text>
      </View>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "dues", label: t("payments.dues") },
          { value: "history", label: t("payments.history") },
        ]}
      />
      {tab === "dues" ? <DuesList /> : <PaymentHistory />}
    </Screen>
  );
}
