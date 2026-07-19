import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Button, Card, Divider, Icon, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { toErrorMessage } from "@/utils/errors";
import { formatDate, formatDateTime, formatMoney } from "@/utils/format";

/**
 * The society's own subscription to Portl. Admin-only — residents never see
 * billing, and are never affected when it lapses.
 *
 * Deliberately reachable at every subscription status, including EXPIRED: this
 * is the screen that lets an admin fix an expired subscription, so gating it
 * would trap the customer we are trying to bill.
 */

type Status = "NONE" | "TRIALING" | "ACTIVE" | "GRACE" | "EXPIRED" | "CANCELLED";

const statusTone: Record<Status, "success" | "warning" | "danger" | "neutral"> = {
  NONE: "neutral",
  TRIALING: "neutral",
  ACTIVE: "success",
  GRACE: "warning",
  EXPIRED: "danger",
  CANCELLED: "warning",
};

export default function Billing() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const showDialog = useUIStore((s) => s.showDialog);
  const utils = trpc.useUtils();

  const sub = trpc.subscription.get.useQuery({});
  const plans = trpc.plan.list.useQuery({});
  const history = trpc.subscription.history.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const checkout = trpc.subscription.checkout.useMutation({
    onSuccess: (session) => {
      // The Razorpay client SDK is not wired into the Expo build yet, so this
      // stops at the order rather than pretending money moved. The order is
      // real: it exists in Razorpay and the webhook will settle it once the
      // SDK opens checkout against this id.
      showToast(t("billing.checkoutStarted", { orderId: session.orderId }), "success");
      void utils.subscription.get.invalidate();
      void utils.subscription.history.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const cancel = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      showToast(t("billing.cancelledToast"), "info");
      void utils.subscription.get.invalidate();
      void utils.plan.list.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  if (sub.isLoading || plans.isLoading) return <Loading />;
  if (sub.error) return <ErrorState message={toErrorMessage(sub.error, t)} onRetry={sub.refetch} />;

  const s = sub.data!;
  const status = (s.status ?? "NONE") as Status;
  const payments = history.data?.pages.flatMap((p) => p.items) ?? [];

  const onCancel = () =>
    showDialog({
      title: t("billing.cancelTitle"),
      // Cancelling is not immediate — say so, or an admin will assume they
      // just cut off their own access.
      message: t("billing.cancelConfirm", {
        date: s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "",
      }),
      actions: [
        { label: t("billing.cancelPlan"), tone: "danger", onPress: () => cancel.mutate({}) },
        { label: t("common.cancel"), tone: "neutral" },
      ],
    });

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("billing.title")} />

      {/* --- Current plan ------------------------------------------------- */}
      <Card className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-0.5">
            <Text variant="overline" color="secondary">
              {t("billing.currentPlan")}
            </Text>
            <Text variant="h3">{s.planName ?? t("billing.noPlan")}</Text>
            {s.price !== null && (
              <Text variant="bodySmall" color="secondary">
                {formatMoney(s.price)} ·{" "}
                {s.intervalMonths === 12 ? t("billing.perYear") : t("billing.perMonth")}
              </Text>
            )}
          </View>
          <Badge
            label={t(`billing.status.${status}`)}
            tone={statusTone[status]}
            uppercase
            size="sm"
          />
        </View>

        {s.currentPeriodEnd && status !== "NONE" && (
          <>
            <Divider />
            <View className="flex-row items-center gap-2">
              <Icon name="calendar-outline" size={16} color="tertiary" />
              <Text variant="bodySmall" color="secondary">
                {status === "CANCELLED"
                  ? t("billing.endsOn", { date: formatDate(s.currentPeriodEnd) })
                  : t("billing.renewsOn", { date: formatDate(s.currentPeriodEnd) })}
              </Text>
            </View>
            {s.daysRemaining !== null && s.daysRemaining >= 0 && (
              <Text variant="caption" color="tertiary">
                {t("billing.daysRemaining", { count: s.daysRemaining })}
              </Text>
            )}
          </>
        )}
      </Card>

      {/* --- Lapse warnings ----------------------------------------------- */}
      {status === "GRACE" && (
        <Card variant="filled" className="gap-1">
          <Text variant="title" color="warning">
            {t("billing.graceTitle")}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {t("billing.graceBody", {
              date: s.graceEndsAt ? formatDate(s.graceEndsAt) : "",
            })}
          </Text>
        </Card>
      )}
      {status === "EXPIRED" && (
        <Card variant="filled" className="gap-1">
          <Text variant="title" color="danger">
            {t("billing.expiredTitle")}
          </Text>
          {/* Say plainly what is and is not affected — an admin seeing
              "expired" will otherwise assume the worst about their data. */}
          <Text variant="bodySmall" color="secondary">
            {t("billing.expiredBody")}
          </Text>
        </Card>
      )}

      {/* --- Plans -------------------------------------------------------- */}
      <View className="gap-2.5">
        <Text variant="label" color="secondary">
          {t("billing.plans")}
        </Text>
        {plans.data?.map((p) => (
          <Card key={p.id} className="gap-3">
            <View className="flex-row items-start gap-3">
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text variant="title">{p.name}</Text>
                  {p.isCurrent && (
                    <Badge label={t("billing.current")} tone="success" size="sm" />
                  )}
                </View>
                {p.description && (
                  <Text variant="bodySmall" color="secondary">
                    {p.description}
                  </Text>
                )}
              </View>
              <View className="items-end">
                <Text variant="title">{formatMoney(p.price)}</Text>
                <Text variant="caption" color="tertiary">
                  {p.intervalMonths === 12 ? t("billing.perYear") : t("billing.perMonth")}
                </Text>
              </View>
            </View>

            {p.features.length > 0 && (
              <View className="gap-1">
                {p.features.map((f) => (
                  <View key={f} className="flex-row items-center gap-2">
                    <Icon name="checkmark-circle-outline" size={15} color="success" />
                    <Text variant="bodySmall" color="secondary">
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Button
              label={
                p.isCurrent && status === "ACTIVE"
                  ? t("billing.renew")
                  : p.isCurrent
                    ? t("billing.reactivate")
                    : t("billing.choosePlan")
              }
              variant={p.isCurrent ? "outline" : "primary"}
              size="sm"
              loading={checkout.isPending && checkout.variables?.planId === p.id}
              onPress={() => checkout.mutate({ planId: p.id })}
            />
          </Card>
        ))}
      </View>

      {/* --- Payment history ---------------------------------------------- */}
      <View className="gap-2.5">
        <Text variant="label" color="secondary">
          {t("billing.history")}
        </Text>
        {history.isLoading ? (
          <Loading />
        ) : payments.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={t("billing.noPayments")}
            body={t("billing.noPaymentsBody")}
          />
        ) : (
          <View className="gap-2">
            {payments.map((p) => (
              <Card key={p.id} variant="filled" className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="bodySmall">{p.planName}</Text>
                  <Text variant="caption" color="tertiary">
                    {p.paidAt ? formatDateTime(p.paidAt) : formatDateTime(p.createdAt)}
                  </Text>
                  {p.periodStart && p.periodEnd && (
                    <Text variant="caption" color="tertiary">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </Text>
                  )}
                </View>
                <View className="items-end gap-1">
                  <Text variant="bodySmall">{formatMoney(p.amount)}</Text>
                  <Badge
                    label={t(`billing.paymentStatus.${p.status}`)}
                    tone={
                      p.status === "SUCCESS"
                        ? "success"
                        : p.status === "FAILED"
                          ? "danger"
                          : "neutral"
                    }
                    size="sm"
                  />
                </View>
              </Card>
            ))}
            {history.hasNextPage && (
              <Button
                label={t("common.loadMore")}
                variant="ghost"
                size="sm"
                loading={history.isFetchingNextPage}
                onPress={() => history.fetchNextPage()}
              />
            )}
          </View>
        )}
      </View>

      {/* --- Cancel ------------------------------------------------------- */}
      {(status === "ACTIVE" || status === "GRACE" || status === "TRIALING") && (
        <>
          <Divider />
          <Button
            label={t("billing.cancelPlan")}
            variant="ghost"
            size="sm"
            loading={cancel.isPending}
            onPress={onCancel}
          />
        </>
      )}
    </Screen>
  );
}
