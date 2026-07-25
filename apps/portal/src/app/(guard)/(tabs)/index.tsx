import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Loading } from "@/components/ListState";
import { NeedsAttention } from "@/components/NeedsAttention";
import { SosButton } from "@/components/SosButton";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Avatar,
  Badge,
  Card,
  GlassCard,
  Icon,
  IconCircle,
  Input,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { hueFor, useTheme, type NeonHue } from "@/theme";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { visitorPurposeIcon } from "@/utils/domain";
import { formatDateTime, formatTime } from "@/utils/format";

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.goodMorning";
  if (h < 17) return "dashboard.goodAfternoon";
  return "dashboard.goodEvening";
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <GlassCard variant="glassStrong" radius="3xl" className="flex-1 items-center gap-1 py-4">
      <Text variant="h1" className={tone}>
        {value}
      </Text>
      <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </GlassCard>
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
    <GlassCard
      onPress={onPress}
      variant="hero"
      radius="3xl"
      className="flex-row items-center gap-3"
    >
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
    </GlassCard>
  );
}

/**
 * Guests residents have pre-approved but who have not reached the gate yet —
 * the queue a guard works from when someone walks up with a pass. Searchable by
 * the guest's name or the pass code, because a guard has exactly one of those
 * two things in hand depending on whether the guest speaks first or shows the
 * pass first.
 *
 * Tapping a row carries the code into the verify screen, so the common case
 * (find the guest, admit them) never needs the code typed at all.
 */
function ExpectedGuests() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // Debounced: the field is being typed into character by character and every
  // keystroke would otherwise be a round-trip.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const passes = trpc.guestPreApproval.listAtGate.useQuery(
    { limit: 20, ...(query ? { search: query } : {}) },
    { refetchInterval: 60_000 },
  );

  const items = passes.data?.items ?? [];
  // Keep the section (and its search field) mounted once a search is running,
  // so a term that matches nothing doesn't yank the input out from under the
  // guard mid-type.
  if (items.length === 0 && !query) return null;

  return (
    <View className="gap-3">
      <SectionHeader title={t("guard.expectedGuests")} />

      <Input
        leftIcon="search-outline"
        placeholder={t("guard.searchPasses")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {items.map((p) => (
        <GlassCard
          key={p.id}
          onPress={() =>
            router.push(`/(guard)/verify?code=${encodeURIComponent(p.qrCode)}`)
          }
          variant="hero"
          radius="3xl"
          className="flex-row items-center gap-3"
        >
          <IconCircle name="ticket-outline" tone="accent" size={44} />
          <View className="flex-1 gap-0.5">
            <Text variant="title" numberOfLines={1}>
              {p.guestName}
            </Text>
            <Text variant="bodySmall" color="secondary" numberOfLines={1}>
              {t("guard.flatLine", { tower: p.towerName, flat: p.flatNumber })} ·{" "}
              {t("guard.passHostedBy", { name: p.hostName })}
            </Text>
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {t("guard.passValidUntil", { time: formatDateTime(p.validTo) })}
            </Text>
          </View>
          <Text
            variant="subtitle"
            style={{ fontFamily: "monospace", letterSpacing: 1.5 }}
          >
            {p.qrCode}
          </Text>
        </GlassCard>
      ))}

      {items.length === 0 && !passes.isLoading && (
        <Card variant="outlined" className="items-center gap-1 py-6">
          <Text variant="bodySmall" color="secondary" align="center">
            {t("guard.noPassMatch", { query })}
          </Text>
        </Card>
      )}
    </View>
  );
}

export default function GuardDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { colors } = useTheme();

  const me = trpc.profile.me.useQuery();
  const unread = trpc.notification.list.useQuery({ limit: 1 });
  const unreadCount = unread.data?.unreadCount ?? 0;
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

  // Tabs mount lazily, so the very first visit renders with nothing in cache.
  // The stat row would otherwise count up from three zeroes.
  if (me.isLoading || today.isLoading) {
    return (
      <Screen scroll contentClassName="gap-6 py-3 pb-8">
        <Loading variant="dashboard" />
      </Screen>
    );
  }

  return (
    <Screen scroll contentClassName="gap-6 py-3 pb-8">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Avatar uri={user?.avatarUrl} name={user?.name} size={44} />
        <View className="shrink flex-1">
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {gate
              ? t("guard.onGate", { gate })
              : t("guard.securityDesk")}
          </Text>
          <Text variant="h3" color="primary" numberOfLines={1}>
            {t(greetingKey(), { name: user?.name?.split(" ")[0] ?? "" })}
          </Text>
        </View>
        {/* Panic alarm sits beside the bell: the one control nobody should
            have to go looking for, on the header of every dashboard. */}
        <View className="flex-row items-center gap-2">
          <SosButton />
          <Pressable
            onPress={() => router.push("/(guard)/notifications" as never)}
            hitSlop={8}
            accessibilityLabel={t("notifications.title")}
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

      {/* Today's stats */}
      <View className="flex-row gap-3">
        <Stat value={items.length} label={t("guard.statRegistered")} tone="text-primary" />
        <Stat value={inside.length} label={t("guard.statInside")} tone="text-success" />
        <Stat value={pending.length} label={t("guard.statPending")} tone="text-warning" />
      </View>

      {/* Anything addressed to this guard that hasn't been seen yet. Renders
          nothing when there is nothing outstanding. */}
      <NeedsAttention role="GUARD" inboxHref="/(guard)/notifications" />

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

      {/* Passes issued from the flats, before the guest gets here. Renders
          nothing while there are none and nothing has been searched for. */}
      <ExpectedGuests />

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
            <GlassCard
              key={v.id}
              onPress={open(v.id)}
              variant="hero"
              radius="3xl"
              className="flex-row items-center gap-3"
            >
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
            </GlassCard>
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
