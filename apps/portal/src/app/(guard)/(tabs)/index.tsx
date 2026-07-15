import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SectionHeader } from "@/components/SectionHeader";
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
import { hueFor, type NeonHue } from "@/theme";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { visitorPurposeIcon } from "@/utils/domain";
import { formatTime } from "@/utils/format";

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.goodMorning";
  if (h < 17) return "dashboard.goodAfternoon";
  return "dashboard.goodEvening";
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <Card variant="filled" className="flex-1 items-center gap-1 py-4">
      <Text variant="h1" className={tone}>
        {value}
      </Text>
      <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

function QuickAction({
  icon,
  hue,
  label,
  onPress,
}: {
  icon: IconName;
  hue: NeonHue;
  label: string;
  onPress: () => void;
}) {
  return (
    <GlassCard
      onPress={onPress}
      variant="neon"
      hue={hue}
      className="w-[47%] grow items-center gap-2 py-5"
    >
      <IconCircle name={icon} hue={hue} />
      <Text variant="subtitle" align="center" numberOfLines={2}>
        {label}
      </Text>
    </GlassCard>
  );
}

/** One visitor row in a guard action queue. */
function QueueRow({
  visitor,
  meta,
  onPress,
}: {
  visitor: {
    id: string;
    name: string;
    purpose: string;
    flatNumber: string;
    towerName: string;
  };
  meta: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress} className="flex-row items-center gap-3">
      <IconCircle
        name={visitorPurposeIcon[visitor.purpose] ?? "help-circle-outline"}
        tone="primary"
        size={44}
      />
      <View className="flex-1 gap-0.5">
        <Text variant="title" numberOfLines={1}>
          {visitor.name}
        </Text>
        <Text variant="bodySmall" color="secondary" numberOfLines={1}>
          {t("guard.flatLine", {
            tower: visitor.towerName,
            flat: visitor.flatNumber,
          })}{" "}
          · {meta}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="tertiary" />
    </Card>
  );
}

export default function GuardDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const me = trpc.profile.me.useQuery();
  const today = trpc.visitor.history.useQuery(
    { period: "TODAY", limit: 100 },
    { refetchInterval: 30_000 },
  );

  const items = today.data?.items ?? [];
  const pending = items.filter((v) => v.status === "PENDING");
  const awaitingEntry = items.filter(
    (v) => v.status === "APPROVED" && !v.entryTime,
  );
  const inside = items.filter((v) => v.entryTime && !v.exitTime);

  const gate = me.data?.guardProfile?.gateAssigned;
  const open = (id: string) => () => router.push(`/(guard)/visitors/${id}`);

  return (
    <Screen scroll contentClassName="gap-6 py-3 pb-8">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Avatar uri={user?.avatarUrl} name={user?.name} size={44} />
        <View className="shrink">
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {gate
              ? t("guard.onGate", { gate })
              : t("guard.securityDesk")}
          </Text>
          <Text variant="h3" color="primary" numberOfLines={1}>
            {t(greetingKey(), { name: user?.name?.split(" ")[0] ?? "" })}
          </Text>
        </View>
      </View>

      {/* Today's stats */}
      <View className="flex-row gap-3">
        <Stat value={items.length} label={t("guard.statRegistered")} tone="text-primary" />
        <Stat value={inside.length} label={t("guard.statInside")} tone="text-success" />
        <Stat value={pending.length} label={t("guard.statPending")} tone="text-warning" />
      </View>

      {/* Quick actions */}
      <View className="flex-row flex-wrap gap-3">
        <QuickAction
          icon="person-add-outline"
          hue={hueFor("visitors")}
          label={t("guard.registerVisitor")}
          onPress={() => router.push("/(guard)/register")}
        />
        <QuickAction
          icon="qr-code-outline"
          hue={hueFor("guests")}
          label={t("guard.verifyPass")}
          onPress={() => router.push("/(guard)/verify")}
        />
      </View>

      {/* Awaiting entry (approved, not yet entered) */}
      {awaitingEntry.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={t("guard.awaitingEntry")} />
          {awaitingEntry.map((v) => (
            <QueueRow
              key={v.id}
              visitor={v}
              meta={t("guard.approvedMeta")}
              onPress={open(v.id)}
            />
          ))}
        </View>
      )}

      {/* Inside now (entered, not exited) */}
      {inside.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={t("guard.insideNow")} />
          {inside.map((v) => (
            <QueueRow
              key={v.id}
              visitor={v}
              meta={t("guard.enteredAt", {
                time: v.entryTime ? formatTime(v.entryTime) : "",
              })}
              onPress={open(v.id)}
            />
          ))}
        </View>
      )}

      {/* Waiting for resident approval */}
      {pending.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={t("guard.waitingApproval")} />
          {pending.map((v) => (
            <Card key={v.id} onPress={open(v.id)} className="flex-row items-center gap-3">
              <IconCircle
                name={visitorPurposeIcon[v.purpose] ?? "help-circle-outline"}
                tone="warning"
                size={44}
              />
              <View className="flex-1 gap-0.5">
                <Text variant="title" numberOfLines={1}>
                  {v.name}
                </Text>
                <Text variant="bodySmall" color="secondary" numberOfLines={1}>
                  {t("guard.flatLine", { tower: v.towerName, flat: v.flatNumber })}
                </Text>
              </View>
              <Badge label={t("status.pending")} tone="warning" uppercase size="sm" />
            </Card>
          ))}
        </View>
      )}

      {items.length === 0 && !today.isLoading && (
        <Card variant="outlined" className="items-center gap-2 py-8">
          <IconCircle name="shield-checkmark-outline" tone="neutral" size={52} />
          <Text variant="title" align="center">
            {t("guard.quietTitle")}
          </Text>
          <Text variant="bodySmall" color="secondary" align="center">
            {t("guard.quietBody")}
          </Text>
        </Card>
      )}
    </Screen>
  );
}
