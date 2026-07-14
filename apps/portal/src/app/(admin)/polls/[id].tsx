import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Card, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export default function PollResults() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const q = trpc.poll.results.useQuery(
    { pollId: id ?? "" },
    { enabled: !!id, refetchInterval: 15_000 },
  );

  const r = q.data;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("polls.results")} />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : r ? (
        <>
          <Card className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Badge
                label={r.isClosed ? t("polls.closed") : t("polls.active")}
                tone={r.isClosed ? "neutral" : "mint"}
                size="sm"
                uppercase
              />
              <Text variant="caption" color="secondary">
                {t("polls.votesCount", { count: r.totalVotes })}
              </Text>
            </View>
            <Text variant="h3">{r.question}</Text>
          </Card>

          <View className="gap-3">
            {r.options.map((o) => (
              <Card key={o.id} variant="filled" className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Text variant="subtitle" className="shrink">
                    {o.text}
                  </Text>
                  <Text variant="subtitle" color="primary">
                    {o.percentage}%
                  </Text>
                </View>
                {/* Progress bar */}
                <View className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                  <View
                    className="h-full rounded-full bg-primary-strong"
                    style={{ width: `${Math.max(o.percentage, 2)}%` }}
                  />
                </View>
                <Text variant="caption" color="tertiary">
                  {t("admin.voteCount", { count: o.votes })}
                </Text>
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
