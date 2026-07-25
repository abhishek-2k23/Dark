import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { Loading } from "@/components/ListState";
import { NeedsAttention } from "@/components/NeedsAttention";
import { SosButton } from "@/components/SosButton";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Avatar,
  Badge,
  Button,
  Card,
  GlassCard,
  Icon,
  IconCircle,
  NeonTile,
  resolveIconColor,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { hueFor, useTheme } from "@/theme";
import { useUIStore } from "@/stores/uiStore";
import { withAlpha } from "@/utils/color";
import { noticeCategoryAccent, noticeCategoryIcon } from "@/utils/domain";
import { formatClock, formatDate, formatDateTime, formatMoney } from "@/utils/format";

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.goodMorning";
  if (h < 17) return "dashboard.goodAfternoon";
  return "dashboard.goodEvening";
}

/** The cross that lets a surfaced card be waved away for this session. */
function DismissX({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: colors.glassFill }}
    >
      <Icon name="close" size={15} color="secondary" />
    </Pressable>
  );
}


export default function ResidentDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const me = trpc.profile.me.useQuery();
  const pending = trpc.visitor.listPending.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const notices = trpc.notice.list.useQuery({ limit: 5 });
  // Filtered server-side: the dashboard only ever wants the unpaid ones, and
  // fetching a page of every booking to find them would be wasteful.
  const unpaid = trpc.amenityBooking.myBookings.useQuery({
    status: "PENDING_PAYMENT",
    limit: 20,
  });
  const polls = trpc.poll.list.useQuery({ state: "ACTIVE", limit: 1 });
  const unread = trpc.notification.list.useQuery({ limit: 1 });

  const afterDecision = () => {
    void utils.visitor.listPending.invalidate();
    void utils.visitor.history.invalidate();
  };
  const approve = trpc.visitor.approve.useMutation({
    onSuccess: () => {
      showToast(t("visitors.approvedToast"), "success");
      afterDecision();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const deny = trpc.visitor.deny.useMutation({
    onSuccess: () => {
      showToast(t("visitors.deniedToast"), "info");
      afterDecision();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const vote = trpc.poll.vote.useMutation({
    onSuccess: () => {
      showToast(t("polls.votedToast"), "success");
      void utils.poll.list.invalidate();
      void utils.poll.results.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const { colors } = useTheme();
  const flat = me.data?.residentProfile;
  const firstPending = pending.data?.[0];
  const activePoll = polls.data?.items[0];
  const unreadCount = unread.data?.unreadCount ?? 0;

  // A free amenity can also sit in PENDING_PAYMENT briefly; nothing is owed on
  // one, so it has no place in a list of what to pay.
  const unpaidBookings = (unpaid.data?.items ?? []).filter((b) => (b.amountDue ?? 0) > 0);
  const unpaidTotal = unpaidBookings.reduce((sum, b) => sum + (b.amountDue ?? 0), 0);

  // Dismissals are keyed by what was on the card, not by the card: waving away
  // one visitor must not swallow the next one, and a dues card dismissed at two
  // bookings should come back when a third appears. Session-only on purpose —
  // these are reminders about live obligations, so a fresh launch retries.
  const [dismissedVisitorId, setDismissedVisitorId] = useState<string | null>(null);
  const [dismissedDuesKey, setDismissedDuesKey] = useState<string | null>(null);
  const duesKey = unpaidBookings.map((b) => b.id).sort().join(",");
  const showVisitorBanner = firstPending && firstPending.id !== dismissedVisitorId;
  const showDuesCard = unpaidBookings.length > 0 && duesKey !== dismissedDuesKey;

  // Tabs mount lazily, so the very first visit renders with nothing in cache.
  // `isLoading` is true only for that first fetch — a later refetch keeps the
  // real screen on show rather than dropping back to a shimmer.
  if (me.isLoading || pending.isLoading) {
    return (
      <Screen scroll contentClassName="gap-6 py-3">
        <Loading variant="dashboard" />
      </Screen>
    );
  }

  return (
    <Screen scroll contentClassName="gap-6 py-3">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <Pressable
          className="flex-1 flex-row items-center gap-3 active:opacity-80"
          onPress={() => router.push("/(resident)/(tabs)/profile")}
        >
          <Avatar uri={user?.avatarUrl} name={user?.name} size={44} />
          <View className="shrink">
            {flat && (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {t("dashboard.flatLine", {
                  flat: flat.flatNumber,
                  tower: flat.towerName,
                })}
              </Text>
            )}
            <Text variant="h3" color="primary" numberOfLines={1}>
              {t(greetingKey(), { name: user?.name?.split(" ")[0] ?? "" })}
            </Text>
          </View>
        </Pressable>
        {/* Panic alarm sits beside the bell: the one control nobody should
            have to go looking for, on the header of every dashboard. */}
        <View className="flex-row items-center gap-2">
          <SosButton />
          <Pressable
            onPress={() => router.push("/(resident)/notifications")}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{
              backgroundColor: colors.glassFill,
              borderWidth: 1,
              borderColor: colors.glassBorder,
            }}
          >
            <Icon name="notifications-outline" size={22} color="content" />
            {unreadCount > 0 && (
              <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-danger" />
            )}
          </Pressable>
        </View>
      </View>

      {/* Pending visitor banner */}
      {showVisitorBanner && (
        <GlassCard variant="neon" className="gap-4">
          <View className="flex-row items-start gap-3">
            <Pressable
              className="flex-1 flex-row items-start gap-3 active:opacity-80"
              onPress={() => router.push(`/(resident)/visitors/${firstPending.id}`)}
            >
              <IconCircle name="location-outline" tone="warning" />
              <View className="shrink gap-0.5">
                <Text variant="title">{t("dashboard.visitorApproval")}</Text>
                <Text variant="body" color="secondary">
                  {t("dashboard.visitorWaiting", {
                    name: firstPending.name,
                    purpose: t(`enums.visitorPurpose.${firstPending.purpose}`),
                  })}
                </Text>
              </View>
            </Pressable>
            {/* Dismissing hides, it does not decide — the visitor stays PENDING
                in the visitors tab, and the guard keeps waiting on an answer. */}
            <DismissX
              label={t("common.close")}
              onPress={() => setDismissedVisitorId(firstPending.id)}
            />
          </View>
          <View className="flex-row gap-3">
            <Button
              label={t("common.approve")}
              variant="success"
              className="flex-1"
              loading={approve.isPending}
              onPress={() => approve.mutate({ visitorId: firstPending.id })}
            />
            <Button
              label={t("common.deny")}
              variant="danger"
              className="flex-1"
              loading={deny.isPending}
              onPress={() => deny.mutate({ visitorId: firstPending.id })}
            />
          </View>
        </GlassCard>
      )}

      {/* Anything that happened to this resident and hasn't been seen — a
          ticket the admin moved, a new notice, a due raised. Renders nothing
          when they are caught up. */}
      <NeedsAttention role="RESIDENT" inboxHref="/(resident)/notifications" />

      {/* Amenity slots being held pending payment. These are easy to forget —
          the slot is reserved but lapses if the money never arrives — so they
          surface here rather than only inside the amenities tab. */}
      {showDuesCard && (
        <GlassCard variant="neon" radius="3xl" padding="lg" className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Icon name="calendar-outline" size={18} color="warning" />
              <Text variant="title" color="warning" numberOfLines={1} className="shrink">
                {t("dashboard.amenityDuesTitle")}
              </Text>
            </View>
            <Text variant="title">{formatMoney(unpaidTotal)}</Text>
            <DismissX
              label={t("common.close")}
              onPress={() => setDismissedDuesKey(duesKey)}
            />
          </View>

          <View className="gap-2">
            {unpaidBookings.slice(0, 3).map((b) => (
              <View key={b.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text variant="bodySmall" numberOfLines={1}>
                    {b.amenityName}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {formatDate(b.date)} · {formatClock(b.startTime)}–
                    {formatClock(b.endTime)}
                  </Text>
                </View>
                <Text variant="bodySmall" color="warning">
                  {formatMoney(b.amountDue ?? 0)}
                </Text>
              </View>
            ))}
          </View>

          <Button
            label={t("dashboard.amenityDuesCta")}
            variant="secondary"
            size="sm"
            onPress={() => router.push("/(resident)/amenities")}
          />
        </GlassCard>
      )}

      {/* Quick actions — a strict 3-column grid. Each cell is exactly a third
          of the row and centres its tile, so the columns line up across rows
          and the spacing comes from the cell, not from ad-hoc gaps (a column
          gap would break the one-third width math and wrap to two per row). */}
      <View className="gap-3">
        <SectionHeader title={t("dashboard.quickActions")} />
        {/* rowGap as an inline style rather than a gap-y class: the vertical
            gap is the one piece of this grid that must never silently drop
            out of the compiled stylesheet, and an explicit style can't. */}
        <View className="flex-row flex-wrap" style={{ rowGap: 28 }}>
          {(
            [
              {
                name: "person-add-outline",
                hue: hueFor("guests"),
                label: t("dashboard.preApproveGuest"),
                onPress: () => router.push("/(resident)/visitors/pre-approve"),
              },
              {
                name: "qr-code-outline",
                hue: hueFor("visitors"),
                label: t("dashboard.myPasses"),
                onPress: () => router.push("/(resident)/(tabs)/visitors"),
              },
              {
                name: "construct-outline",
                hue: hueFor("tickets"),
                label: t("dashboard.raiseTicket"),
                onPress: () => router.push("/(resident)/tickets/create"),
              },
              {
                name: "calendar-outline",
                hue: hueFor("amenities"),
                label: t("dashboard.bookAmenity"),
                onPress: () => router.push("/(resident)/amenities"),
              },
              {
                name: "people-outline",
                hue: hueFor("directory"),
                label: t("dashboard.serviceDirectory"),
                onPress: () => router.push("/(resident)/directory"),
              },
              {
                name: "wallet-outline",
                hue: hueFor("payments"),
                label: t("dashboard.payDues"),
                onPress: () => router.push("/(resident)/(tabs)/payments"),
              },
            ] as const
          ).map((tile) => (
            <View key={tile.label} className="w-1/3 items-center">
              <NeonTile
                name={tile.name}
                hue={tile.hue}
                label={tile.label}
                onPress={tile.onPress}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Notices carousel. The glass belongs to each card, not to the section:
          a panel behind the whole shelf boxed in the header too and read as a
          second surface stacked under the cards. */}
      <View className="gap-3">
        <SectionHeader
          title={t("dashboard.noticesUpdates")}
          onSeeAll={() => router.push("/(resident)/notices")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Spacing lives in contentContainerStyle rather than a className: the
          // gap has to apply to the scrolling content, and the negative margin
          // that lets the shelf bleed past the screen gutter belongs to the
          // ScrollView itself. Mixing the two on one element loses one of them.
          className="-mx-5"
          contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
        >
          {notices.data?.items.map((n) => {
            const accent = noticeCategoryAccent[n.category] ?? "neonBlue";
            const accentColor = resolveIconColor(colors, accent);
            return (
              // `neon`, not `hero`: hero's near-opaque fill is the one glass
              // variant that doesn't look like glass — neon keeps the fill
              // translucent so the aurora shows through, with the bright
              // hairline carrying the card's edge.
              <GlassCard
                key={n.id}
                variant="neon"
                blur
                radius="3xl"
                onPress={() => router.push(`/(resident)/notices/${n.id}`)}
                padding="lg"
                className="w-72 gap-2"
              >
                <View className="flex-row items-center gap-2">
                  {/* Category chip — a faint wash of the accent so the icon
                      reads as a badge on the card instead of a loose glyph. */}
                  <View
                    className="h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: withAlpha(accentColor, 0.14),
                      borderWidth: 1,
                      borderColor: withAlpha(accentColor, 0.35),
                    }}
                  >
                    <Icon
                      name={noticeCategoryIcon[n.category] ?? "megaphone-outline"}
                      size={15}
                      color={accent}
                    />
                  </View>
                  <Text variant="overline" style={{ color: accentColor }}>
                    {t(`enums.noticeCategory.${n.category}`)}
                  </Text>
                </View>
                {/* Fixed two-line box so every card in the shelf is the same
                    height, whatever its title length. */}
                <Text variant="h3" numberOfLines={2} className="min-h-[52px]">
                  {n.title}
                </Text>
                <Text variant="bodySmall" color="secondary" numberOfLines={1}>
                  {formatDateTime(n.scheduledAt ?? n.createdAt)}
                </Text>
              </GlassCard>
            );
          })}
          {notices.data && notices.data.items.length === 0 && (
            <GlassCard blur radius="3xl" className="w-72 items-center py-6">
              <Text variant="bodySmall" color="secondary">
                {t("notices.empty")}
              </Text>
            </GlassCard>
          )}
        </ScrollView>
      </View>

      {/* Active poll */}
      {activePoll && (
        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Icon name="stats-chart-outline" size={18} color="primary" />
              <Text variant="title" color="primary">
                {t("dashboard.activePoll")}
              </Text>
            </View>
            <Badge label={t("common.live")} tone="mint" dot uppercase />
          </View>
          <Text variant="body">{activePoll.question}</Text>
          <View className="gap-2">
            {activePoll.options.map((opt) => {
              const chosen = activePoll.myOptionIds.includes(opt.id);
              return (
                <Pressable
                  key={opt.id}
                  disabled={vote.isPending}
                  onPress={() =>
                    vote.mutate({ pollId: activePoll.id, optionId: opt.id })
                  }
                  className={`flex-row items-center justify-between rounded-xl border px-4 py-3 active:opacity-80 ${
                    chosen ? "border-primary bg-primary-soft" : "border-border"
                  }`}
                >
                  <Text
                    variant="subtitle"
                    color={chosen ? "primary" : "content"}
                    className="shrink"
                  >
                    {opt.text}
                  </Text>
                  <Icon
                    name={chosen ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={chosen ? "primary" : "tertiary"}
                  />
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row items-center justify-between">
            <Text variant="caption" color="secondary">
              {t("polls.votesCount", { count: activePoll.totalVotes })}
            </Text>
            <Button
              label={t("polls.results")}
              variant="ghost"
              size="sm"
              onPress={() => router.push(`/(resident)/polls/${activePoll.id}`)}
            />
          </View>
        </Card>
      )}
    </Screen>
  );
}
