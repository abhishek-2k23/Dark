import { useRouter } from "expo-router";
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
  value: string;
  onPress?: () => void;
}) {
  return (
    <Card variant="filled" onPress={onPress} className="flex-row items-center gap-3">
      <IconCircle name={icon} tone="primary" size={38} />
      <View className="flex-1 gap-0.5">
        <Text variant="subtitle">{label}</Text>
        <Text variant="bodySmall" color="secondary" numberOfLines={1}>
          {value}
        </Text>
      </View>
      {onPress && <Icon name="chevron-forward" size={18} color="tertiary" />}
    </Card>
  );
}

/**
 * Billing entry point. The subtitle carries the plan and status rather than a
 * bare "Billing", because a lapsed subscription is something an admin needs to
 * notice from the profile screen, not only after tapping through.
 */
function BillingRow() {
  const { t } = useTranslation();
  const router = useRouter();
  const sub = trpc.subscription.get.useQuery({});

  const value = !sub.data
    ? t("common.loading")
    : sub.data.status === "NONE"
      ? t("billing.noPlan")
      : `${sub.data.planName} · ${t(`billing.status.${sub.data.status}`)}`;

  return (
    <Row
      icon="card-outline"
      label={t("billing.title")}
      value={value}
      onPress={() => router.push("/(admin)/billing")}
    />
  );
}

export default function AdminProfileTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const showToast = useUIStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const q = trpc.profile.me.useQuery();
  const me = q.data;

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
                label={
                  me.adminProfile?.designation
                    ? t(`admin.designations.${me.adminProfile.designation}`)
                    : t("admin.roleBadge")
                }
                tone="primary"
                className="self-center"
              />
            </View>
          </View>

          <View className="gap-2.5">
            <Text variant="label" color="secondary">
              {t("guard.society")}
            </Text>
            <Row
              icon="business-outline"
              label={t("admin.societyDetails")}
              value={me.society?.name ?? t("profile.notSet")}
              onPress={() => router.push("/(admin)/society")}
            />
            <BillingRow />
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
