import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { BiometricLockToggle } from "@/components/BiometricLockToggle";
import { DevTools } from "@/components/DevTools";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ErrorState, Loading } from "@/components/ListState";
import { AccountLegalActions } from "@/components/AccountLegalActions";
import { ProfileAvatar } from "@/components/media";
import {
  Badge,
  Card,
  Divider,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { formatClock } from "@/utils/format";

function Row({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <Card variant="filled" className="flex-row items-center gap-3">
      <IconCircle name={icon} tone="primary" size={38} />
      <View className="flex-1 gap-0.5">
        <Text variant="subtitle">{label}</Text>
        <Text variant="bodySmall" color="secondary" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

export default function GuardProfileTab() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const q = trpc.profile.me.useQuery();
  const me = q.data;
  const gp = me?.guardProfile;

  const shift =
    gp?.shiftStart && gp?.shiftEnd
      ? `${formatClock(gp.shiftStart)} – ${formatClock(gp.shiftEnd)}`
      : t("profile.notSet");

  return (
    <Screen scroll contentClassName="gap-5 py-3 pb-8">
      {q.isLoading ? (
        <Loading variant="profile" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : me ? (
        <>
          <View className="items-center gap-3 pt-2">
            <ProfileAvatar uri={me.avatarUrl} name={me.name} size={88} />
            <View className="w-full items-center gap-1.5">
              <Text variant="h1" align="center" className="px-3">
                {me.name}
              </Text>
              <Badge
                label={t("guard.roleBadge")}
                tone="primary"
                className="self-center"
              />
            </View>
          </View>

          <View className="gap-2.5">
            <Text variant="label" color="secondary">
              {t("guard.dutyInfo")}
            </Text>
            <Row
              icon="location-outline"
              label={t("guard.gateAssigned")}
              value={gp?.gateAssigned ?? t("profile.notSet")}
            />
            <Row icon="time-outline" label={t("guard.shift")} value={shift} />
            {me.society && (
              <Row
                icon="business-outline"
                label={t("guard.society")}
                value={me.society.name}
              />
            )}
          </View>

          <View className="gap-2.5">
            <Text variant="label" color="secondary">
              {t("profile.account")}
            </Text>
            {me.email && (
              <Row icon="mail-outline" label={t("signup.email")} value={me.email} />
            )}
            {me.phone && (
              <Row icon="call-outline" label={t("signup.phone")} value={me.phone} />
            )}
          </View>

          <View className="gap-2.5">
            <Text variant="label" color="secondary">
              {t("settings.appearance")}
            </Text>
            <ThemeSwitcher />
            <Text variant="label" color="secondary" className="mt-2">
              {t("settings.language")}
            </Text>
            <LanguageSwitcher />
          </View>

          <BiometricLockToggle />

          <DevTools />

          <Divider />

          <AccountLegalActions
            loggingOut={busy}
            onLogout={async () => {
              setBusy(true);
              await logout();
              showToast(t("profile.loggedOut"), "info");
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
