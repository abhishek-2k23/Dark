import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { TabPage } from "@/components/TabPage";
import {
  Badge,
  Button,
  Card,
  IconCircle,
  Screen,
  SwipeTabs,
  Text,
  type SegmentOption,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { ticketCategoryIcon, ticketStatusTone } from "@/utils/domain";
import { formatShortDate } from "@/utils/format";

type Filter = "ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED";

/** The resident's tickets for one status filter; each pager page owns its query. */
function TicketList({ filter }: { filter: Filter }) {
  const { t } = useTranslation();
  const router = useRouter();

  const q = trpc.ticket.list.useInfiniteQuery(
    { limit: 20, ...(filter === "ALL" ? {} : { status: filter }) },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return (
      <EmptyState
        icon="construct-outline"
        title={t("tickets.empty")}
        body={t("tickets.emptyBody")}
      />
    );

  return (
    <>
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
    </>
  );
}

export default function TicketsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");

  const options: SegmentOption<Filter>[] = [
    { value: "ALL", label: t("visitors.all") },
    { value: "OPEN", label: t("enums.ticketStatus.OPEN") },
    { value: "IN_PROGRESS", label: t("tickets.inProgressShort") },
    { value: "RESOLVED", label: t("enums.ticketStatus.RESOLVED") },
  ];

  return (
    <Screen padded={false}>
      <View className="gap-4 px-5">
        <StackHeader title={t("tickets.title")} />
        <Button
          label={t("dashboard.raiseTicket")}
          variant="primary"
          leftIcon="add-circle-outline"
          onPress={() => router.push("/(resident)/tickets/create")}
          fullWidth
        />
      </View>

      <SwipeTabs
        value={filter}
        onChange={setFilter}
        tabsClassName="mx-5 mb-1 mt-3"
        options={options}
      >
        <TabPage>
          <TicketList filter="ALL" />
        </TabPage>
        <TabPage>
          <TicketList filter="OPEN" />
        </TabPage>
        <TabPage>
          <TicketList filter="IN_PROGRESS" />
        </TabPage>
        <TabPage>
          <TicketList filter="RESOLVED" />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
