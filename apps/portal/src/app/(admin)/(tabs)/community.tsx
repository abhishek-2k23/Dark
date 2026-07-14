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
    icon: "megaphone-outline",
    tone: "primary",
    titleKey: "notices.title",
    bodyKey: "admin.noticesBody",
    href: "/(admin)/notices",
  },
  {
    icon: "stats-chart-outline",
    tone: "accent",
    titleKey: "polls.title",
    bodyKey: "admin.pollsBody",
    href: "/(admin)/polls",
  },
  {
    icon: "construct-outline",
    tone: "warning",
    titleKey: "admin.complaints",
    bodyKey: "admin.complaintsBody",
    href: "/(admin)/tickets",
  },
];

export default function AdminCommunityTab() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen scroll contentClassName="gap-4 py-3 pb-8">
      <View>
        <Text variant="h1">{t("community.title")}</Text>
        <Text variant="body" color="secondary">
          {t("admin.communitySubtitle")}
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
