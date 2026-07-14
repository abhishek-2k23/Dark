import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { VisitorRow } from "@/components/VisitorRow";
import { Button, Screen, SegmentedControl, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";

type Period = "TODAY" | "WEEK" | "MONTH" | "ALL";

export default function GuardLog() {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("TODAY");

  const q = trpc.visitor.history.useInfiniteQuery(
    { period, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen scroll contentClassName="gap-4 py-3 pb-8">
      <View>
        <Text variant="h1">{t("guard.logTitle")}</Text>
        <Text variant="body" color="secondary">
          {t("guard.logSubtitle")}
        </Text>
      </View>

      <SegmentedControl
        value={period}
        onChange={setPeriod}
        options={[
          { value: "TODAY", label: t("visitors.today") },
          { value: "WEEK", label: t("visitors.week") },
          { value: "MONTH", label: t("visitors.month") },
          { value: "ALL", label: t("visitors.all") },
        ]}
      />

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="time-outline" title={t("visitors.noHistory")} />
      ) : (
        <View className="gap-3">
          {items.map((v) => (
            <VisitorRow
              key={v.id}
              visitor={v}
              onPress={() => router.push(`/(guard)/visitors/${v.id}`)}
            />
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
