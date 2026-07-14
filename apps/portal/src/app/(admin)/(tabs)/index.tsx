import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SectionHeader } from "@/components/SectionHeader";
import {
  Avatar,
  Badge,
  Card,
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconCircleTone,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

function Kpi({
  icon,
  tone,
  value,
  label,
  onPress,
}: {
  icon: IconName;
  tone: IconCircleTone;
  value: number | string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} className="w-[47%] grow gap-2" variant="elevated">
      <IconCircle name={icon} tone={tone} size={40} />
      <Text variant="h1">{value}</Text>
      <Text variant="caption" color="secondary" numberOfLines={2}>
        {label}
      </Text>
    </Card>
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

  const recent = tickets.data?.items.slice(0, 5) ?? [];

  return (
    <Screen scroll contentClassName="gap-6 py-3 pb-8">
      {/* Header */}
      <View className="flex-row items-center gap-3">
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

      {/* KPIs */}
      <View className="flex-row flex-wrap gap-3">
        <Kpi
          icon="walk-outline"
          tone="primary"
          value={withPlus(visitors.data?.items.length ?? 0, 100)}
          label={t("admin.kpiVisitorsToday")}
          onPress={() => router.push("/(admin)/reports")}
        />
        <Kpi
          icon="construct-outline"
          tone="warning"
          value={withPlus(openTickets.data?.items.length ?? 0, 100)}
          label={t("admin.kpiOpenComplaints")}
          onPress={() => router.push("/(admin)/tickets")}
        />
        <Kpi
          icon="stats-chart-outline"
          tone="accent"
          value={withPlus(polls.data?.items.length ?? 0, 100)}
          label={t("admin.kpiActivePolls")}
          onPress={() => router.push("/(admin)/polls")}
        />
        <Kpi
          icon="wallet-outline"
          tone="danger"
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
            label={t("admin.inviteResident")}
            onPress={() => router.push("/(admin)/residents/invite")}
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
