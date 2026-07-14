import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ErrorState, Loading } from "@/components/ListState";
import { AccountLegalActions } from "@/components/AccountLegalActions";
import {
  Avatar,
  Badge,
  Button,
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
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : me ? (
        <>
          <View className="items-center gap-3 pt-2">
            <Avatar uri={me.avatarUrl} name={me.name} size={88} />
            <View className="items-center gap-1.5">
              <Text variant="h1" align="center">
                {me.name}
              </Text>
              <Badge
                label={me.adminProfile?.designation ?? t("admin.roleBadge")}
                tone="primary"
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

          <Divider />

          <Button
            label={t("profile.logout")}
            variant="outline"
            leftIcon="log-out-outline"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              await logout();
              showToast(t("profile.loggedOut"), "info");
            }}
            fullWidth
          />

          <Divider />

          <AccountLegalActions />
        </>
      ) : null}
    </Screen>
  );
}
