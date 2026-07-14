import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Avatar,
  Badge,
  Card,
  Icon,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { serviceCategoryIcon } from "@/utils/domain";

const CATEGORIES = ["ALL", "MAID", "ELECTRICIAN", "PLUMBER", "DRIVER", "OTHER"] as const;
type Cat = (typeof CATEGORIES)[number];

export default function DirectoryScreen() {
  const { t } = useTranslation();
  const [cat, setCat] = useState<Cat>("ALL");

  const q = trpc.serviceProvider.list.useQuery(
    cat === "ALL" ? {} : { category: cat },
  );

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("directory.title")} />

      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = c === cat;
          return (
            <Pressable
              key={c}
              onPress={() => setCat(c)}
              className={`rounded-full border px-4 py-2 active:opacity-80 ${
                active ? "border-primary bg-primary-soft" : "border-border bg-surface"
              }`}
            >
              <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                {c === "ALL" ? t("visitors.all") : t(`enums.serviceCategory.${c}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <EmptyState icon="people-outline" title={t("directory.empty")} />
      ) : (
        <View className="gap-3">
          {q.data.map((p) => (
            <Card key={p.id} className="flex-row items-center gap-3">
              <Avatar uri={p.photoUrl} name={p.name} size={44} />
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-1.5">
                  <Text variant="title" numberOfLines={1} className="shrink">
                    {p.name}
                  </Text>
                  {p.isVerified && (
                    <Icon name="checkmark-circle" size={16} color="success" />
                  )}
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Icon
                    name={serviceCategoryIcon[p.category] ?? "briefcase-outline"}
                    size={14}
                    color="secondary"
                  />
                  <Text variant="bodySmall" color="secondary">
                    {t(`enums.serviceCategory.${p.category}`)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => Linking.openURL(`tel:${p.phone}`)}
                hitSlop={8}
                className="h-11 w-11 items-center justify-center rounded-full bg-success-soft active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={t("directory.call", { name: p.name })}
              >
                <Icon name="call" size={20} color="success" />
              </Pressable>
            </Card>
          ))}
        </View>
      )}

      <Badge label={t("directory.verifiedHint")} tone="success" className="self-center" />
    </Screen>
  );
}
