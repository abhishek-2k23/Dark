import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Card, Icon, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";

/** Poll voting + live results (results shown once the caller has voted or the poll closed). */
export default function PollDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const results = trpc.poll.results.useQuery(
    { pollId: id ?? "" },
    { enabled: !!id },
  );
  const list = trpc.poll.list.useQuery({ state: "ALL", limit: 100 });
  const poll = list.data?.items.find((p) => p.id === id);

  const vote = trpc.poll.vote.useMutation({
    onSuccess: () => {
      showToast(t("polls.votedToast"), "success");
      void utils.poll.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const hasVoted = (poll?.myOptionIds.length ?? 0) > 0;
  const showResults = hasVoted || poll?.isClosed;

  return (
    <Screen scroll contentClassName="gap-4 pb-8">
      <StackHeader title={t("polls.detailTitle")} />

      {list.isLoading || results.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={list.refetch} />
      ) : poll ? (
        <Card padding="lg" className="gap-4">
          <View className="flex-row items-start justify-between gap-3">
            <Text variant="h3" className="flex-1">
              {poll.question}
            </Text>
            <Badge
              label={poll.isClosed ? t("polls.closed") : t("common.live")}
              tone={poll.isClosed ? "neutral" : "mint"}
              dot={!poll.isClosed}
              uppercase
              size="sm"
            />
          </View>

          <View className="gap-2.5">
            {poll.options.map((opt) => {
              const chosen = poll.myOptionIds.includes(opt.id);
              const tally = results.data?.options.find((o) => o.id === opt.id);
              const pct = tally?.percentage ?? 0;

              if (showResults) {
                return (
                  <View key={opt.id} className="gap-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="flex-1 flex-row items-center gap-1.5">
                        {chosen && (
                          <Icon name="checkmark-circle" size={16} color="primary" />
                        )}
                        <Text variant="subtitle" className="shrink" numberOfLines={2}>
                          {opt.text}
                        </Text>
                      </View>
                      <Text variant="subtitle" color="secondary">
                        {pct}% · {tally?.votes ?? 0}
                      </Text>
                    </View>
                    <View className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                      <View
                        className={chosen ? "h-full bg-primary" : "h-full bg-primary/40"}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </View>
                  </View>
                );
              }

              return (
                <Pressable
                  key={opt.id}
                  disabled={vote.isPending}
                  onPress={() => vote.mutate({ pollId: poll.id, optionId: opt.id })}
                  className="flex-row items-center justify-between rounded-xl border border-border px-4 py-3.5 active:opacity-80"
                >
                  <Text variant="subtitle" className="shrink">
                    {opt.text}
                  </Text>
                  <Icon name="radio-button-off" size={20} color="tertiary" />
                </Pressable>
              );
            })}
          </View>

          <Text variant="caption" color="secondary">
            {t("polls.votesCount", { count: results.data?.totalVotes ?? poll.totalVotes })}
            {poll.allowMultiple ? ` · ${t("polls.multipleAllowed")}` : ""}
          </Text>
        </Card>
      ) : (
        <ErrorState message={t("polls.notFound")} />
      )}
    </Screen>
  );
}
