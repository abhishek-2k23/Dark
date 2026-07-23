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
import { formatDateTime } from "@/utils/format";

type State = "ACTIVE" | "CLOSED" | "ALL";

/** The polls for one state filter; each pager page owns its query. */
function PollList({ state }: { state: State }) {
  const { t } = useTranslation();
  const router = useRouter();

  const q = trpc.poll.list.useInfiniteQuery(
    { state, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return <EmptyState icon="stats-chart-outline" title={t("polls.empty")} />;

  return (
    <>
      {items.map((p) => (
        <Card
          key={p.id}
          onPress={() => router.push(`/(resident)/polls/${p.id}`)}
          className="flex-row items-center gap-3"
        >
          <IconCircle name="stats-chart-outline" tone="primary" size={44} />
          <View className="flex-1 gap-0.5">
            <Text variant="title" numberOfLines={2}>
              {p.question}
            </Text>
            <Text variant="bodySmall" color="secondary">
              {t("polls.votesCount", { count: p.totalVotes })} ·{" "}
              {t("polls.deadline", { date: formatDateTime(p.deadline) })}
            </Text>
          </View>
          <Badge
            label={p.isClosed ? t("polls.closed") : t("common.live")}
            tone={p.isClosed ? "neutral" : "mint"}
            dot={!p.isClosed}
            uppercase
            size="sm"
          />
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

export default function PollsScreen() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>("ACTIVE");

  const options: SegmentOption<State>[] = [
    { value: "ACTIVE", label: t("polls.active") },
    { value: "CLOSED", label: t("polls.closed") },
    { value: "ALL", label: t("visitors.all") },
  ];

  return (
    <Screen padded={false}>
      <View className="px-5">
        <StackHeader title={t("polls.title")} />
      </View>
      <SwipeTabs
        value={state}
        onChange={setState}
        tabsClassName="mx-5 mb-1 mt-2"
        options={options}
      >
        <TabPage>
          <PollList state="ACTIVE" />
        </TabPage>
        <TabPage>
          <PollList state="CLOSED" />
        </TabPage>
        <TabPage>
          <PollList state="ALL" />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
