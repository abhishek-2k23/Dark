import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
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
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

export default function ComplaintsBoard() {
  const { t } = useTranslation();
  const router = useRouter();

  const q = trpc.ticket.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("admin.complaints")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="construct-outline" title={t("tickets.empty")} />
      ) : (
        <View className="gap-3">
          {items.map((tk) => (
            <Card
              key={tk.id}
              onPress={() => router.push(`/(admin)/tickets/${tk.id}`)}
              className="gap-3"
            >
              {/* Title line: category, summary, reference, status. */}
              <View className="flex-row items-start gap-3">
                <IconCircle
                  name={ticketCategoryIcon[tk.category] ?? "build-outline"}
                  tone="primary"
                  size={44}
                />
                <View className="flex-1 gap-0.5">
                  <Text variant="title" numberOfLines={1}>
                    {tk.title}
                  </Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {tk.referenceCode} · {formatDateTime(tk.createdAt)}
                  </Text>
                </View>
                <Badge
                  label={t(`enums.ticketStatus.${tk.status}`)}
                  tone={ticketStatusTone[tk.status] ?? "neutral"}
                  dot
                  uppercase
                  size="sm"
                />
              </View>

              {/* Who raised it, and who is working it. */}
              <View className="flex-row gap-3">
                <View className="flex-1 flex-row items-center gap-2.5">
                  <Avatar name={tk.raisedBy.name} size={32} />
                  <View className="flex-1">
                    <Text variant="overline" color="tertiary">
                      {t("tickets.raisedByLabel")}
                    </Text>
                    <Text variant="subtitle" numberOfLines={1}>
                      {tk.raisedBy.name}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {t("guard.flatLine", {
                        tower: tk.towerName,
                        flat: tk.flatNumber,
                      })}
                    </Text>
                  </View>
                </View>
                <View className="flex-1 flex-row items-center gap-2.5">
                  {tk.assignedTo ? (
                    <Avatar name={tk.assignedTo.name} size={32} ring />
                  ) : (
                    <IconCircle name="person-outline" tone="neutral" size={32} />
                  )}
                  <View className="flex-1">
                    <Text variant="overline" color="tertiary">
                      {t("tickets.assignedToLabel")}
                    </Text>
                    <Text
                      variant="subtitle"
                      color={tk.assignedTo ? undefined : "tertiary"}
                      numberOfLines={1}
                    >
                      {tk.assignedTo?.name ?? t("tickets.unassigned")}
                    </Text>
                  </View>
                </View>
              </View>

              <Divider />

              {/* Conversation preview: the newest comment, or a quiet nudge. */}
              {tk.latestComment ? (
                <View className="gap-1 rounded-xl bg-surface-muted p-3">
                  <View className="flex-row items-center gap-1.5">
                    <Icon name="chatbubble-outline" size={13} color="tertiary" />
                    <Text
                      variant="caption"
                      color="tertiary"
                      numberOfLines={1}
                      className="flex-1"
                    >
                      {tk.latestComment.authorName} ·{" "}
                      {formatDateTime(tk.latestComment.createdAt)}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {t("tickets.comments", { count: tk.commentCount })}
                    </Text>
                  </View>
                  <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                    {tk.latestComment.message}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-1.5">
                  <Icon name="chatbubble-outline" size={13} color="tertiary" />
                  <Text variant="caption" color="tertiary">
                    {t("tickets.noComments")}
                  </Text>
                </View>
              )}

              <View className="flex-row items-center gap-2">
                <Badge
                  label={t(`enums.ticketPriority.${tk.priority}`)}
                  tone={tk.priority === "HIGH" ? "danger" : "neutral"}
                  size="sm"
                />
                <Badge
                  label={t(`enums.ticketCategory.${tk.category}`)}
                  tone="primary"
                  size="sm"
                />
              </View>
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
