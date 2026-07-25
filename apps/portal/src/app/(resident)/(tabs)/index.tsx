import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

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
import { noticeCategoryAccent, noticeCategoryIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.goodMorning";
  if (h < 17) return "dashboard.goodAfternoon";
  return "dashboard.goodEvening";
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
      {firstPending && (
        <GlassCard variant="neon" className="gap-4">
          <Pressable
            className="flex-row items-start gap-3 active:opacity-80"
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

      {/* Quick actions */}
      <View className="gap-3">
        <SectionHeader title={t("dashboard.quickActions")} />
        <View className="flex-row justify-between">
          <NeonTile
            name="person-add-outline"
            hue={hueFor("guests")}
            label={t("dashboard.preApproveGuest")}
            onPress={() => router.push("/(resident)/visitors/pre-approve")}
          />
          <NeonTile
            name="construct-outline"
            hue={hueFor("tickets")}
            label={t("dashboard.raiseTicket")}
            onPress={() => router.push("/(resident)/tickets/create")}
          />
          <NeonTile
            name="calendar-outline"
            hue={hueFor("amenities")}
            label={t("dashboard.bookAmenity")}
            onPress={() => router.push("/(resident)/amenities")}
          />
          <NeonTile
            name="wallet-outline"
            hue={hueFor("payments")}
            label={t("dashboard.payDues")}
            onPress={() => router.push("/(resident)/(tabs)/payments")}
          />
        </View>
      </View>

      {/* Notices carousel */}
      <View className="gap-3">
        <SectionHeader
          title={t("dashboard.noticesUpdates")}
          onSeeAll={() => router.push("/(resident)/notices")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3"
          className="-mx-5 px-5"
        >
          {notices.data?.items.map((n) => {
            const accent = noticeCategoryAccent[n.category] ?? "neonBlue";
            return (
              <GlassCard
                key={n.id}
                variant="hero"
                radius="3xl"
                onPress={() => router.push(`/(resident)/notices/${n.id}`)}
                padding="lg"
                className="w-72 gap-1"
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon
                    name={noticeCategoryIcon[n.category] ?? "megaphone-outline"}
                    size={14}
                    color={accent}
                  />
                  <Text
                    variant="overline"
                    style={{ color: resolveIconColor(colors, accent) }}
                  >
                    {t(`enums.noticeCategory.${n.category}`)}
                  </Text>
                </View>
                <Text variant="h3" numberOfLines={2}>
                  {n.title}
                </Text>
                <Text
                  variant="bodySmall"
                  color="secondary"
                  numberOfLines={1}
                >
                  {formatDateTime(n.scheduledAt ?? n.createdAt)}
                </Text>
              </GlassCard>
            );
          })}
          {notices.data && notices.data.items.length === 0 && (
            <GlassCard radius="3xl" className="w-72 items-center py-6">
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
