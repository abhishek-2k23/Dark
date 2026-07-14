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
import { formatDateTime } from "@/utils/format";

type State = "ACTIVE" | "CLOSED" | "ALL";

export default function ManagePolls() {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, setState] = useState<State>("ALL");

  const q = trpc.poll.list.useInfiniteQuery(
    { state, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader
        title={t("polls.title")}
        right={
          <Button
            label={t("admin.newPoll")}
            variant="secondary"
            size="sm"
            leftIcon="add"
            onPress={() => router.push("/(admin)/polls/create")}
          />
        }
      />

      <SegmentedControl
        value={state}
        onChange={setState}
        options={[
          { value: "ALL", label: t("visitors.all") },
          { value: "ACTIVE", label: t("polls.active") },
          { value: "CLOSED", label: t("polls.closed") },
        ]}
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="stats-chart-outline" title={t("polls.empty")} />
      ) : (
        <View className="gap-3">
          {items.map((p) => (
            <Card
              key={p.id}
              onPress={() => router.push(`/(admin)/polls/${p.id}`)}
              className="flex-row items-center gap-3"
            >
              <IconCircle name="stats-chart-outline" tone="accent" size={44} />
              <View className="flex-1 gap-0.5">
                <Text variant="title" numberOfLines={2}>
                  {p.question}
                </Text>
                <Text variant="caption" color="secondary">
                  {t("polls.votesCount", { count: p.totalVotes })} ·{" "}
                  {formatDateTime(p.deadline)}
                </Text>
              </View>
              <Badge
                label={p.isClosed ? t("polls.closed") : t("polls.active")}
                tone={p.isClosed ? "neutral" : "mint"}
                size="sm"
                uppercase
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
        </View>
      )}
    </Screen>
  );
}
