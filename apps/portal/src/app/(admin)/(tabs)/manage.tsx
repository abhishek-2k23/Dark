import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  Card,
  Icon,
  IconCircle,
  Screen,
  Text,
  type IconCircleTone,
  type IconName,
} from "@/components/ui";

interface Entry {
  icon: IconName;
  tone: IconCircleTone;
  titleKey: string;
  bodyKey: string;
  href: Href;
}

const ENTRIES: Entry[] = [
  {
    icon: "business-outline",
    tone: "primary",
    titleKey: "admin.property",
    bodyKey: "admin.propertyBody",
    href: "/(admin)/towers",
  },
  {
    icon: "people-outline",
    tone: "success",
    titleKey: "admin.residents",
    bodyKey: "admin.residentsBody",
    href: "/(admin)/residents",
  },
  {
    icon: "shield-outline",
    tone: "accent",
    titleKey: "admin.staffAccounts",
    bodyKey: "admin.staffAccountsBody",
    href: "/(admin)/staff",
  },
  {
    icon: "construct-outline",
    tone: "warning",
    titleKey: "directory.title",
    bodyKey: "admin.directoryBody",
    href: "/(admin)/directory",
  },
  {
    icon: "tennisball-outline",
    tone: "peach",
    titleKey: "amenities.title",
    bodyKey: "admin.amenitiesBody",
    href: "/(admin)/amenities",
  },
  {
    icon: "bar-chart-outline",
    tone: "primary",
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
            <IconCircle name={e.icon} tone={e.tone} size={48} />
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
