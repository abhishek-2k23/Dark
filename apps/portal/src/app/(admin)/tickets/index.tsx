import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

const STATUSES = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default function ComplaintsBoard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const q = trpc.ticket.list.useInfiniteQuery(
    { status: status === "ALL" ? undefined : status, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("admin.complaints")} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="-mx-5 px-5"
      >
        {STATUSES.map((s) => {
          const active = s === status;
          return (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              className={`rounded-full border px-4 py-2 active:opacity-80 ${
                active ? "border-primary bg-primary-soft" : "border-border bg-surface"
              }`}
            >
              <Text variant="subtitle" color={active ? "primary" : "secondary"}>
                {s === "ALL" ? t("visitors.all") : t(`enums.ticketStatus.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
              className="gap-2"
            >
              <View className="flex-row items-center gap-3">
                <IconCircle
                  name={ticketCategoryIcon[tk.category] ?? "build-outline"}
                  tone="primary"
                  size={44}
                />
                <View className="flex-1 gap-0.5">
                  <Text variant="title" numberOfLines={1}>
                    {tk.title}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {t("guard.flatLine", {
                      tower: tk.towerName,
                      flat: tk.flatNumber,
                    })}{" "}
                    · {formatDateTime(tk.createdAt)}
                  </Text>
                </View>
                <Badge
                  label={t(`enums.ticketStatus.${tk.status}`)}
                  tone={ticketStatusTone[tk.status] ?? "neutral"}
                  uppercase
                  size="sm"
                />
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge
                  label={t(`enums.ticketPriority.${tk.priority}`)}
                  tone={tk.priority === "HIGH" ? "danger" : "neutral"}
                  size="sm"
                />
                {tk.assignedTo && (
                  <Text variant="caption" color="tertiary">
                    {t("tickets.assignedTo", { name: tk.assignedTo.name })}
                  </Text>
                )}
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
