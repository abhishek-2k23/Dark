import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import { SectionHeader } from "@/components/SectionHeader";
import { SosButton } from "@/components/SosButton";
import {
  Avatar,
  Badge,
  Card,
  GlassCard,
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { hueFor, radius, useTheme, type NeonHue } from "@/theme";
import { withAlpha } from "@/utils/color";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

function Kpi({
  icon,
  hue,
  value,
  label,
  onPress,
}: {
  icon: IconName;
  hue: NeonHue;
  value: number | string;
  label: string;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  return (
    <GlassCard
      onPress={onPress}
      variant="glassStrong"
      padding="none"
      className="w-[47%] grow"
    >
      {/* Neutral top sheen — the "glass layer" over the card. There is no hue
          wash under it: the card's color is the aurora showing through the
          translucent fill. Explicit borderRadius keeps corners rounded like
          every other card even where overflow clipping of the overlay is
          unreliable. */}
      <LinearGradient
        colors={[withAlpha("#FFFFFF", dark ? 0.09 : 0.45), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          {
            height: "55%",
            borderTopLeftRadius: radius["2xl"],
            borderTopRightRadius: radius["2xl"],
          },
        ]}
      />
      <View className="gap-2 p-4">
        <IconCircle name={icon} hue={hue} size={40} />
        <Text variant="h1">{value}</Text>
        <Text variant="caption" color="secondary" numberOfLines={2}>
          {label}
        </Text>
      </View>
    </GlassCard>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Card
      onPress={onPress}
      variant="filled"
      className="w-[47%] grow flex-row items-center gap-2.5"
    >
      <IconCircle name={icon} tone="primary" size={36} />
      <Text variant="subtitle" className="shrink" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

function withPlus(n: number, cap: number): string {
  return n >= cap ? `${cap}+` : String(n);
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const me = trpc.profile.me.useQuery();
  const visitors = trpc.visitor.history.useQuery({ period: "TODAY", limit: 100 });
  const tickets = trpc.ticket.list.useQuery({ limit: 20 });
  const openTickets = trpc.ticket.list.useQuery({ status: "OPEN", limit: 100 });
  const polls = trpc.poll.list.useQuery({ state: "ACTIVE", limit: 100 });
  const overdue = trpc.due.list.useQuery({ status: "OVERDUE", limit: 100 });
  const unread = trpc.notification.list.useQuery({ limit: 1 });

  const recent = tickets.data?.items.slice(0, 5) ?? [];
  const unreadCount = unread.data?.unreadCount ?? 0;
  const { colors: themeColors } = useTheme();

  return (
    <Screen scroll contentClassName="gap-6 py-3 pb-8">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-3">
          <Avatar uri={user?.avatarUrl} name={user?.name} size={44} />
          <View className="shrink">
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {me.data?.society?.name ?? t("admin.roleBadge")}
            </Text>
            <Text variant="h3" color="primary" numberOfLines={1}>
              {t("admin.dashboardTitle")}
            </Text>
          </View>
        </View>
        {/* Panic alarm sits beside the bell: the one control nobody should
            have to go looking for, on the header of every dashboard. */}
        <View className="flex-row items-center gap-2">
          <SosButton />
          <Pressable
            onPress={() => router.push("/(admin)/notifications" as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.title")}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{
              backgroundColor: themeColors.glassFill,
              borderWidth: 1,
              borderColor: themeColors.glassBorder,
            }}
          >
            <Icon name="notifications-outline" size={22} color="content" />
            {unreadCount > 0 && (
              <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-danger" />
            )}
          </Pressable>
        </View>
      </View>

      {/* KPIs */}
      <View className="flex-row flex-wrap gap-3">
        <Kpi
          icon="walk-outline"
          hue={hueFor("visitors")}
          value={withPlus(visitors.data?.items.length ?? 0, 100)}
          label={t("admin.kpiVisitorsToday")}
          onPress={() => router.push("/(admin)/reports")}
        />
        <Kpi
          icon="construct-outline"
          hue={hueFor("tickets")}
          value={withPlus(openTickets.data?.items.length ?? 0, 100)}
          label={t("admin.kpiOpenComplaints")}
          onPress={() => router.push("/(admin)/tickets")}
        />
        <Kpi
          icon="stats-chart-outline"
          hue={hueFor("polls")}
          value={withPlus(polls.data?.items.length ?? 0, 100)}
          label={t("admin.kpiActivePolls")}
          onPress={() => router.push("/(admin)/polls")}
        />
        <Kpi
          icon="wallet-outline"
          hue={hueFor("payments")}
          value={withPlus(overdue.data?.items.length ?? 0, 100)}
          label={t("admin.kpiOverdueDues")}
          onPress={() => router.push("/(admin)/reports")}
        />
      </View>

      {/* Quick actions */}
      <View className="gap-3">
        <SectionHeader title={t("dashboard.quickActions")} />
        <View className="flex-row flex-wrap gap-3">
          <QuickAction
            icon="megaphone-outline"
            label={t("admin.postNotice")}
            onPress={() => router.push("/(admin)/notices/create")}
          />
          <QuickAction
            icon="stats-chart-outline"
            label={t("admin.createPoll")}
            onPress={() => router.push("/(admin)/polls/create")}
          />
          <QuickAction
            icon="person-add-outline"
            label={t("admin.addResidents")}
            onPress={() => router.push("/(admin)/residents/invite")}
          />
          {/* The two queues that actually wait on an admin. Both were reachable
              only through the Manage tab, which is where things go to be found
              on purpose rather than noticed. */}
          <QuickAction
            icon="receipt-outline"
            label={t("admin.verifyPayments")}
            onPress={() => router.push("/(admin)/payments/verify")}
          />
          <QuickAction
            icon="enter-outline"
            label={t("admin.joinRequests")}
            onPress={() => router.push("/(admin)/join-requests")}
          />
          <QuickAction
            icon="business-outline"
            label={t("admin.manageProperty")}
            onPress={() => router.push("/(admin)/towers")}
          />
        </View>
      </View>

      {/* Recent complaints */}
      <View className="gap-3">
        <SectionHeader
          title={t("admin.recentComplaints")}
          onSeeAll={() => router.push("/(admin)/tickets")}
        />
        {recent.length === 0 ? (
          <Card variant="outlined" className="items-center py-6">
            <Text variant="bodySmall" color="secondary">
              {t("tickets.empty")}
            </Text>
          </Card>
        ) : (
          recent.map((tk) => (
            <Card
              key={tk.id}
              onPress={() => router.push(`/(admin)/tickets/${tk.id}`)}
              className="flex-row items-center gap-3"
            >
              <IconCircle
                name={ticketCategoryIcon[tk.category] ?? "build-outline"}
                tone="primary"
                size={42}
              />
              <View className="flex-1 gap-0.5">
                <Text variant="title" numberOfLines={1}>
                  {tk.title}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {t("guard.flatLine", { tower: tk.towerName, flat: tk.flatNumber })} ·{" "}
                  {formatDateTime(tk.createdAt)}
                </Text>
              </View>
              <Badge
                label={t(`enums.ticketStatus.${tk.status}`)}
                tone={ticketStatusTone[tk.status] ?? "neutral"}
                uppercase
                size="sm"
              />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
