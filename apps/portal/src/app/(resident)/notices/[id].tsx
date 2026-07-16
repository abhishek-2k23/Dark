import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Card, Divider, IconCircle, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { noticeCategoryIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

// No dedicated notice.get endpoint — resolve the notice from the first page
// of the (already filtered, published-only) list.
export default function NoticeDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = trpc.notice.list.useQuery({ limit: 100 });
  const notice = q.data?.items.find((n) => n.id === id);

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("notices.detailTitle")} />
      {q.isLoading ? (
        <Loading variant="detail" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : notice ? (
        <Card padding="lg" className="gap-4">
          <View className="flex-row items-center gap-3">
            <IconCircle
              name={noticeCategoryIcon[notice.category] ?? "megaphone-outline"}
              tone={notice.category === "EMERGENCY" ? "danger" : "primary"}
              size={48}
            />
            <View className="flex-1 gap-1">
              <Text variant="h2">{notice.title}</Text>
              <Badge
                label={t(`enums.noticeCategory.${notice.category}`)}
                tone={notice.category === "EMERGENCY" ? "danger" : "primary"}
                size="sm"
              />
            </View>
          </View>
          {notice.imageUrl && (
            <Image
              source={{ uri: notice.imageUrl }}
              style={{ width: "100%", aspectRatio: 3, borderRadius: 12 }}
              contentFit="cover"
              transition={150}
            />
          )}
          <Divider />
          <Text variant="bodyLarge">{notice.body}</Text>
          <Text variant="caption" color="tertiary">
            {t("notices.publishedBy", {
              name: notice.publishedBy.name,
              date: formatDateTime(notice.scheduledAt ?? notice.createdAt),
            })}
          </Text>
        </Card>
      ) : (
        <ErrorState message={t("notices.notFound")} />
      )}
    </Screen>
  );
}
