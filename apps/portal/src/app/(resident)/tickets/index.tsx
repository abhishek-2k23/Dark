import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  SegmentedControl,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatShortDate } from "@/utils/format";

type Filter = "ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED";

export default function TicketsList() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");

  const q = trpc.ticket.list.useInfiniteQuery(
    { limit: 20, ...(filter === "ALL" ? {} : { status: filter }) },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("tickets.title")} />

      <Button
        label={t("dashboard.raiseTicket")}
        variant="primary"
        leftIcon="add-circle-outline"
        onPress={() => router.push("/(resident)/tickets/create")}
        fullWidth
      />

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: t("visitors.all") },
          { value: "OPEN", label: t("enums.ticketStatus.OPEN") },
          { value: "IN_PROGRESS", label: t("tickets.inProgressShort") },
          { value: "RESOLVED", label: t("enums.ticketStatus.RESOLVED") },
        ]}
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="construct-outline"
          title={t("tickets.empty")}
          body={t("tickets.emptyBody")}
        />
      ) : (
        <View className="gap-3">
          {items.map((tk) => (
            <Card
              key={tk.id}
              onPress={() => router.push(`/(resident)/tickets/${tk.id}`)}
              className="gap-3"
            >
              <View className="flex-row items-center gap-3">
                <IconCircle
                  name={ticketCategoryIcon[tk.category] ?? "build-outline"}
                  tone="primary"
                  size={44}
                />
                <View className="flex-1 gap-0.5">
                  {/* The reference leads: it's what a resident matches against
                      when they're chasing one specific complaint. */}
                  <Text
                    variant="caption"
                    color="primary"
                    style={{ fontFamily: "monospace" }}
                  >
                    {tk.referenceCode}
                  </Text>
                  <Text variant="title" numberOfLines={1}>
                    {tk.title}
                  </Text>
                  <Text variant="bodySmall" color="secondary" numberOfLines={1}>
                    {t(`enums.ticketCategory.${tk.category}`)} ·{" "}
                    {formatShortDate(tk.createdAt)} ·{" "}
                    {t("tickets.comments", { count: tk.commentCount })}
                  </Text>
                </View>
                <Badge
                  label={t(`enums.ticketStatus.${tk.status}`)}
                  tone={ticketStatusTone[tk.status] ?? "neutral"}
                  uppercase
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
