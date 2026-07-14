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
    bodyKey: "community.noticesBody",
    href: "/(resident)/notices",
  },
  {
    icon: "stats-chart-outline",
    tone: "accent",
    titleKey: "polls.title",
    bodyKey: "community.pollsBody",
    href: "/(resident)/polls",
  },
  {
    icon: "construct-outline",
    tone: "warning",
    titleKey: "tickets.title",
    bodyKey: "community.ticketsBody",
    href: "/(resident)/tickets",
  },
  {
    icon: "business-outline",
    tone: "peach",
    titleKey: "amenities.title",
    bodyKey: "community.amenitiesBody",
    href: "/(resident)/amenities",
  },
  {
    icon: "people-outline",
    tone: "success",
    titleKey: "directory.title",
    bodyKey: "community.directoryBody",
    href: "/(resident)/directory",
  },
];

export default function CommunityTab() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen scroll contentClassName="gap-4 py-3 pb-8">
      <View>
        <Text variant="h1">{t("community.title")}</Text>
        <Text variant="body" color="secondary">
          {t("community.subtitle")}
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
