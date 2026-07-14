import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { noticeCategoryIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

export default function NoticesList() {
  const { t } = useTranslation();
  const router = useRouter();
  const q = trpc.notice.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("notices.title")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="megaphone-outline" title={t("notices.empty")} />
      ) : (
        <View className="gap-3">
          {items.map((n) => (
            <Card
              key={n.id}
              onPress={() => router.push(`/(resident)/notices/${n.id}`)}
              className="gap-2"
            >
              <View className="flex-row items-center gap-3">
                <IconCircle
                  name={noticeCategoryIcon[n.category] ?? "megaphone-outline"}
                  tone={n.category === "EMERGENCY" ? "danger" : "primary"}
                  size={44}
                />
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    {n.isPinned && <Icon name="pin" size={14} color="warning" />}
                    <Text variant="title" numberOfLines={1} className="shrink">
                      {n.title}
                    </Text>
                  </View>
                  <Text variant="bodySmall" color="secondary" numberOfLines={1}>
                    {formatDateTime(n.scheduledAt ?? n.createdAt)}
                  </Text>
                </View>
                <Badge
                  label={t(`enums.noticeCategory.${n.category}`)}
                  tone={n.category === "EMERGENCY" ? "danger" : "primary"}
                  size="sm"
                />
              </View>
              <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                {n.body}
              </Text>
            </Card>
          ))}
          {q.hasNextPage && (
            <Button
              label={t("common.loadMore")}
              variant="ghost"
              size="sm"
              loading={q.isFetchingNextPage}
              onPress={() => q.fetchNextPage()}
            />
          )}
        </View>
      )}
    </Screen>
  );
}
