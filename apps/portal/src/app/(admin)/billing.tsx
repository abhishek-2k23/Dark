import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import RazorpayCheckout, { type RazorpayError } from "react-native-razorpay";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  Screen,
  Skeleton,
  Text,
} from "@/components/ui";
import { PlanCard, featureSlots } from "@/components/PlanCard";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { useTheme } from "@/theme";
import { withAlpha } from "@/utils/color";
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

/** Screen's own horizontal padding (px-5), which the carousel undoes. */
const SCREEN_PAD = 20;
/** Left/right gutter, and how much of the next card stays visible. */
const GUTTER = 16;
const PEEK = 42;
const CARD_GAP = 12;

type Status = "NONE" | "TRIALING" | "ACTIVE" | "GRACE" | "EXPIRED" | "CANCELLED";

const statusTone: Record<Status, "success" | "warning" | "danger" | "neutral"> = {
  NONE: "neutral",
  TRIALING: "neutral",
  ACTIVE: "success",
  GRACE: "warning",
  EXPIRED: "danger",
  CANCELLED: "warning",
};

/** Payment outcomes, and the filter's extra "everything" option. */
type PaymentStatus = "INITIATED" | "SUCCESS" | "FAILED";
type StatusFilter = "ALL" | PaymentStatus;

const STATUS_FILTERS: StatusFilter[] = ["ALL", "SUCCESS", "INITIATED", "FAILED"];

const paymentTone: Record<PaymentStatus, "success" | "warning" | "danger"> = {
  SUCCESS: "success",
  INITIATED: "warning",
  FAILED: "danger",
};

/** History page size, and how many rows from the end to prefetch the next. */
const PAGE_SIZE = 10;
const PREFETCH_ROWS = 3;

/**
 * The history filter: a compact chip in the section header that opens a menu.
 *
 * A dropdown rather than a segmented control because the options are a
 * single-choice list that is usually left alone — a full-width control would
 * spend a row of the screen advertising a filter nobody has touched.
 */
function StatusFilterButton({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  // Screen coordinates of the chip, captured on press. The menu is positioned
  // against these rather than centred.
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  const labelFor = (v: StatusFilter) =>
    v === "ALL" ? t("billing.filterAll") : t(`billing.paymentStatus.${v}`);

  // A Modal is still what hosts the menu — it is the only way to escape the
  // parent ScrollView's bounds and draw above the rest of the screen — but it
  // is transparent and full-bleed, so the menu itself sits at the anchor.
  const open = () =>
    anchorRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));

  const MENU_WIDTH = 190;
  const GAP = 6;
  // Rough menu height; only used to decide whether to flip above the chip.
  const menuHeight = STATUS_FILTERS.length * 46;
  const flipUp = anchor ? anchor.y + anchor.h + GAP + menuHeight > screenH - 24 : false;

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={t("billing.filterBy", { status: labelFor(value) })}
        className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70"
        style={{
          backgroundColor: colors.glassFill,
          borderWidth: 1,
          // An active filter is worth noticing — it explains why rows are
          // missing. "All" stays neutral so it does not nag.
          borderColor: value === "ALL" ? colors.glassBorder : withAlpha(colors.primary, 0.5),
        }}
      >
        <Icon name="filter-outline" size={14} color={value === "ALL" ? "secondary" : "primary"} />
        <Text variant="caption" color={value === "ALL" ? "secondary" : "primary"}>
          {labelFor(value)}
        </Text>
        <Icon name="chevron-down" size={12} color={value === "ALL" ? "secondary" : "primary"} />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAnchor(null)}
      >
        {/* Full-bleed backdrop: tapping anywhere off the menu closes it. */}
        <Pressable className="flex-1" onPress={() => setAnchor(null)}>
          {anchor && (
            <View
              style={{
                position: "absolute",
                // Right-aligned to the chip, which sits at the right edge of
                // the section header — so the menu opens inward, never off
                // the screen.
                right: Math.max(8, screenW - (anchor.x + anchor.w)),
                ...(flipUp
                  ? { bottom: screenH - anchor.y + GAP }
                  : { top: anchor.y + anchor.h + GAP }),
                width: MENU_WIDTH,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                // Lifts the menu off the content it covers.
                shadowColor: "#000",
                shadowOpacity: 0.28,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 12,
              }}
            >
              {STATUS_FILTERS.map((opt, i) => {
                const active = opt === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      onChange(opt);
                      setAnchor(null);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                    style={
                      i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined
                    }
                  >
                    <Text variant="bodySmall" color={active ? "primary" : "content"}>
                      {labelFor(opt)}
                    </Text>
                    {active && <Icon name="checkmark" size={15} color="primary" />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

export default function Billing() {
  const { t } = useTranslation();
  const { width: screenW } = useWindowDimensions();
  const CARD_WIDTH = screenW - GUTTER * 2 - PEEK;
  const showToast = useUIStore((s) => s.showToast);
  const showDialog = useUIStore((s) => s.showDialog);
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  // Measured from a real row so the prefetch trigger tracks the actual card
  // height instead of a guess that drifts with font scaling.
  const [rowHeight, setRowHeight] = useState(0);

  const sub = trpc.subscription.get.useQuery({});
  const plans = trpc.plan.list.useQuery({});
  const history = trpc.subscription.history.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
    },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const me = trpc.profile.me.useQuery();

  const verify = trpc.subscription.verify.useMutation({
    onSuccess: () => {
      showToast(t("billing.paidToast"), "success");
      void utils.subscription.get.invalidate();
      void utils.subscription.history.invalidate();
      void utils.plan.list.invalidate();
    },
    onError: (e) => showToast(toErrorMessage(e, t), "error"),
  });

  const checkout = trpc.subscription.checkout.useMutation({
    onSuccess: async (session) => {
      try {
        const result = await RazorpayCheckout.open({
          key: session.keyId,
          order_id: session.orderId,
          // Razorpay speaks integer paise; the server sends rupees.
          amount: Math.round(session.amount * 100),
          currency: session.currency,
          name: "Portl",
          description: session.planName,
          prefill: {
            email: me.data?.email ?? undefined,
            contact: me.data?.phone ?? undefined,
            name: me.data?.name ?? undefined,
          },
          theme: { color: "#2563EB" },
        });

        // The callback is signed with a secret only the server holds, so this
        // confirms the payment immediately instead of waiting on the webhook.
        // It is a fast path, not the source of truth: if the app dies here the
        // webhook still settles it.
        verify.mutate({
          orderId: result.razorpay_order_id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        });
      } catch (err) {
        const e = err as RazorpayError;
        // Razorpay reports a user closing the sheet as an error. Treat it as
        // what it is — a cancellation — rather than alarming them with a
        // failure toast for something they chose to do.
        const cancelled =
          String(e?.code) === "0" ||
          /cancel/i.test(e?.description ?? "") ||
          /cancel/i.test(e?.error?.reason ?? "");
        showToast(
          cancelled ? t("billing.checkoutCancelled") : (e?.description ?? t("billing.checkoutFailed")),
          cancelled ? "info" : "error",
        );
        // The order stays INITIATED and is simply never captured; the next
        // attempt creates a fresh one.
        void utils.subscription.history.invalidate();
      }
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

  // Loading and error render inside Screen, not as a bare early return: the
  // theme background, aurora and header all live on Screen, so returning
  // without it flashes an unthemed white panel before the data lands.
  if (sub.isLoading || plans.isLoading || sub.error) {
    return (
      <Screen scroll contentClassName="gap-4 pb-8">
        <StackHeader title={t("billing.title")} />
        {sub.error ? (
          <ErrorState message={toErrorMessage(sub.error, t)} onRetry={sub.refetch} />
        ) : (
          <Loading variant="billing" />
        )}
      </Screen>
    );
  }

  const s = sub.data!;
  const status = (s.status ?? "NONE") as Status;
  const payments = history.data?.pages.flatMap((p) => p.items) ?? [];
  const maxFeatureSlots = Math.max(1, ...(plans.data ?? []).map(featureSlots));
  // Every card is the same height, so "PREFETCH_ROWS rows from the bottom" is
  // just a pixel distance — which is what a ScrollView can actually tell us.
  // With a page of 10 and a 3-row margin the next page starts loading as the
  // 7th comes into view.
  const prefetchMargin = rowHeight * PREFETCH_ROWS;

  const onHistoryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!history.hasNextPage || history.isFetchingNextPage || rowHeight === 0) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const fromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (fromBottom <= prefetchMargin) void history.fetchNextPage();
  };

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
    <Screen
      scroll
      contentClassName="gap-4 pb-8"
      scrollProps={{ onScroll: onHistoryScroll, scrollEventThrottle: 64 }}
    >
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
        <Text variant="label" color="secondary" className="px-1">
          {t("billing.plans")}
        </Text>
        {/* Peeking carousel: the next card is deliberately part-visible so the
            row reads as scrollable without needing an affordance. snapToInterval
            keeps each card landing flush against the left gutter. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_GAP}
          snapToAlignment="start"
          // Screen applies px-5; the carousel has to break out of it or the
          // peeking card is clipped by the parent's padding instead of
          // running off the edge.
          style={{ marginHorizontal: -SCREEN_PAD }}
          contentContainerStyle={{
            paddingHorizontal: GUTTER,
            gap: CARD_GAP,
            paddingVertical: 4,
          }}
        >
          {plans.data?.map((p, i) => (
            <PlanCard
              key={p.id}
              plan={p}
              width={CARD_WIDTH}
              // The tallest plan's row count, applied to all of them, is what
              // puts every CTA on the same baseline.
              featureSlots={maxFeatureSlots}
              // Middle plan carries the emphasis, the usual pricing-table
              // convention — unless the society already has one, in which case
              // theirs is the one worth highlighting.
              featured={
                plans.data?.some((x) => x.isCurrent) ? p.isCurrent : i === 1
              }
              ctaLabel={
                p.isCurrent && status === "ACTIVE"
                  ? t("billing.renew")
                  : p.isCurrent
                    ? t("billing.reactivate")
                    : t("billing.choosePlan")
              }
              intervalLabel={
                p.intervalMonths === 12 ? t("billing.year") : t("billing.month")
              }
              currentLabel={t("billing.current")}
              featuredLabel={t("billing.popular")}
              loading={
                (checkout.isPending && checkout.variables?.planId === p.id) ||
                verify.isPending
              }
              onPress={() => checkout.mutate({ planId: p.id })}
            />
          ))}
        </ScrollView>
      </View>

      {/* --- Payment history ---------------------------------------------- */}
      <View className="gap-2.5">
        <View className="flex-row items-center justify-between">
          <Text variant="label" color="secondary">
            {t("billing.history")}
          </Text>
          <StatusFilterButton value={statusFilter} onChange={setStatusFilter} />
        </View>

        {history.isLoading ? (
          <Loading />
        ) : payments.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            // A filtered-to-empty list is not the same as having never been
            // charged — saying "no payments yet" there reads as data loss.
            title={
              statusFilter === "ALL" ? t("billing.noPayments") : t("billing.noMatchingPayments")
            }
            body={
              statusFilter === "ALL"
                ? t("billing.noPaymentsBody")
                : t("billing.noMatchingPaymentsBody")
            }
          />
        ) : (
          <View className="gap-2">
            {payments.map((p, i) => (
              <Card
                key={p.id}
                variant="filled"
                className="flex-row items-center gap-3"
                // One row is enough to derive the prefetch distance; they are
                // all the same shape.
                onLayout={
                  i === 0
                    ? (e) => setRowHeight(e.nativeEvent.layout.height)
                    : undefined
                }
              >
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
                    tone={paymentTone[p.status as PaymentStatus] ?? "neutral"}
                    size="sm"
                  />
                </View>
              </Card>
            ))}

            {/* Shimmer placeholders standing in for the page being fetched, so
                the list grows into them instead of jumping. */}
            {history.isFetchingNextPage &&
              Array.from({ length: 2 }, (_, i) => (
                <Skeleton
                  key={`next-${i}`}
                  radius={16}
                  style={{ height: rowHeight || 76 }}
                />
              ))}
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
