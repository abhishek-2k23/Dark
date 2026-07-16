import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

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
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Card
      variant="filled"
      onPress={onPress}
      className="flex-row items-center gap-3"
    >
      <IconCircle name={icon} tone="primary" size={38} />
      <View className="flex-1 gap-0.5">
        <Text variant="subtitle">{label}</Text>
        {value && (
          <Text variant="bodySmall" color="secondary" numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {onPress && <Icon name="chevron-forward" size={18} color="tertiary" />}
    </Card>
  );
}

export default function ProfileTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const q = trpc.profile.me.useQuery();
  const me = q.data;
  const rp = me?.residentProfile;

  const push = (href: Href) => () => router.push(href);

  return (
    <Screen scroll contentClassName="gap-5 py-3 pb-8">
      {q.isLoading ? (
        <Loading variant="profile" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : me ? (
        <>
          {/* Identity */}
          <View className="items-center gap-3 pt-2">
            <ProfileAvatar uri={me.avatarUrl} name={me.name} size={88} />
            <View className="w-full items-center gap-1.5">
              <Text variant="h1" align="center" className="px-3">
                {me.name}
              </Text>
              {rp && (
                <Badge
                  label={t("profile.flatBadge", {
                    tower: rp.towerName,
                    flat: rp.flatNumber,
                    society: me.society?.name ?? "",
                  })}
                  tone="primary"
                  className="self-center"
                />
              )}
            </View>
          </View>

          {/* Account */}
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
            <Row
              icon="medkit-outline"
              label={t("profile.emergencyContact")}
              value={
                me.emergencyContactName
                  ? `${me.emergencyContactName} · ${me.emergencyContactPhone ?? ""}`
                  : t("profile.notSet")
              }
              onPress={push("/(resident)/profile-setup?edit=1")}
            />
          </View>

          {/* Household */}
          <View className="gap-2.5">
            <Text variant="label" color="secondary">
              {t("profile.household")}
            </Text>
            <Row
              icon="people-outline"
              label={t("family.title")}
              value={t("profile.memberCount", {
                count: rp?.familyMembers.length ?? 0,
              })}
              onPress={push("/(resident)/family")}
            />
            <Row
              icon="car-outline"
              label={t("vehicles.title")}
              value={t("profile.vehicleCount", { count: rp?.vehicles.length ?? 0 })}
              onPress={push("/(resident)/vehicles")}
            />
          </View>

          {/* Preferences */}
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
