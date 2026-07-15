import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, IconCircle, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { notificationTypeIcon } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

/** Best-effort deep link from a notification's data payload (admin routes). */
function hrefFor(type: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, string>;
  if (d.ticketId) return `/(admin)/tickets/${d.ticketId}`;
  if (d.pollId) return `/(admin)/polls/${d.pollId}`;
  if (d.noticeId) return "/(admin)/notices";
  if (d.visitorId) return "/(admin)/reports";
  if (type === "DUE_GENERATED") return "/(admin)/reports";
  return null;
}

export default function AdminNotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const utils = trpc.useUtils();

  const q = trpc.notification.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = q.data?.pages[0]?.unreadCount ?? 0;

  const invalidate = () => void utils.notification.list.invalidate();
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: invalidate,
  });
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: invalidate,
  });

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("notifications.title")}
        right={
          unreadCount > 0 ? (
            <Button
              label={t("notifications.readAll")}
              variant="ghost"
              size="sm"
              loading={markAllRead.isPending}
              onPress={() => markAllRead.mutate({})}
            />
          ) : undefined
        }
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title={t("notifications.empty")}
          body={t("notifications.emptyBody")}
        />
      ) : (
        <View className="gap-3">
          {items.map((n) => {
            const href = hrefFor(n.type, n.data);
            return (
              <Card
                key={n.id}
                variant={n.isRead ? "filled" : "elevated"}
                onPress={() => {
                  if (!n.isRead) markRead.mutate({ notificationId: n.id });
                  if (href) router.push(href as never);
                }}
                className="flex-row items-start gap-3"
              >
                <IconCircle
                  name={notificationTypeIcon[n.type] ?? "notifications-outline"}
                  tone={n.isRead ? "neutral" : "primary"}
                  size={40}
                />
                <View className="flex-1 gap-0.5">
                  <Text
                    variant={n.isRead ? "subtitle" : "title"}
                    numberOfLines={2}
                  >
                    {n.title}
                  </Text>
                  <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                    {n.body}
                  </Text>
                  <Text variant="caption" color="tertiary">
                    {formatDateTime(n.createdAt)}
                  </Text>
                </View>
                {!n.isRead && (
                  <View className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </Card>
            );
          })}
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
