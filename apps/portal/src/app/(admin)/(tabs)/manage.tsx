import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  Card,
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconName,
} from "@/components/ui";
import { hueFor, type NeonHue } from "@/theme";

interface Entry {
  icon: IconName;
  hue: NeonHue;
  titleKey: string;
  bodyKey: string;
  href: Href;
}

const ENTRIES: Entry[] = [
  {
    icon: "business-outline",
    hue: hueFor("home"),
    titleKey: "admin.property",
    bodyKey: "admin.propertyBody",
    href: "/(admin)/towers",
  },
  {
    icon: "people-outline",
    hue: hueFor("community"),
    titleKey: "admin.residents",
    bodyKey: "admin.residentsBody",
    href: "/(admin)/residents",
  },
  {
    icon: "shield-outline",
    hue: hueFor("staff"),
    titleKey: "admin.staffAccounts",
    bodyKey: "admin.staffAccountsBody",
    href: "/(admin)/staff",
  },
  {
    icon: "construct-outline",
    hue: hueFor("directory"),
    titleKey: "directory.title",
    bodyKey: "admin.directoryBody",
    href: "/(admin)/directory",
  },
  {
    icon: "tennisball-outline",
    hue: hueFor("amenities"),
    titleKey: "amenities.title",
    bodyKey: "admin.amenitiesBody",
    href: "/(admin)/amenities",
  },
  {
    icon: "person-add-outline",
    hue: hueFor("residents"),
    titleKey: "admin.joinRequests",
    bodyKey: "admin.joinRequestsBody",
    href: "/(admin)/join-requests",
  },
  {
    icon: "receipt-outline",
    hue: hueFor("payments"),
    titleKey: "admin.verifyPayments",
    bodyKey: "admin.verifyPaymentsBody",
    href: "/(admin)/payments/verify",
  },
  {
    icon: "bar-chart-outline",
    hue: hueFor("reports"),
    titleKey: "admin.reports",
    bodyKey: "admin.reportsBody",
    href: "/(admin)/reports",
  },
];

export default function AdminManageTab() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen scroll contentClassName="gap-4 py-3 pb-8">
      <View>
        <Text variant="h1">{t("admin.manageTitle")}</Text>
        <Text variant="body" color="secondary">
          {t("admin.manageSubtitle")}
        </Text>
      </View>
      <View className="gap-3">
        {ENTRIES.map((e) => (
          <Card
            key={e.titleKey}
            onPress={() => router.push(e.href)}
            className="flex-row items-center gap-3"
          >
            <IconCircle name={e.icon} hue={e.hue} size={48} />
            <View className="flex-1 gap-0.5">
              <Text variant="title">{t(e.titleKey)}</Text>
              <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                {t(e.bodyKey)}
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="tertiary" />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
