import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { TabPage } from "@/components/TabPage";
import { VisitorRow } from "@/components/VisitorRow";
import {
  Button,
  Screen,
  SwipeTabs,
  Text,
  type SegmentOption,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";

type Period = "TODAY" | "WEEK" | "MONTH" | "ALL";

/** The visitor history for one time window; each pager page owns its query. */
function PeriodLog({ period }: { period: Period }) {
  const { t } = useTranslation();
  const router = useRouter();

  const q = trpc.visitor.history.useInfiniteQuery(
    { period, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (items.length === 0)
    return <EmptyState icon="time-outline" title={t("visitors.noHistory")} />;

  return (
    <>
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
    </>
  );
}

export default function GuardLog() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("TODAY");

  const options: SegmentOption<Period>[] = [
    { value: "TODAY", label: t("visitors.today") },
    { value: "WEEK", label: t("visitors.week") },
    { value: "MONTH", label: t("visitors.month") },
    { value: "ALL", label: t("visitors.all") },
  ];

  return (
    <Screen padded={false} contentClassName="pt-3">
      <View className="px-5">
        <Text variant="h1">{t("guard.logTitle")}</Text>
        <Text variant="body" color="secondary">
          {t("guard.logSubtitle")}
        </Text>
      </View>

      <SwipeTabs
        value={period}
        onChange={setPeriod}
        tabsClassName="mx-5 mb-1 mt-4"
        options={options}
      >
        <TabPage>
          <PeriodLog period="TODAY" />
        </TabPage>
        <TabPage>
          <PeriodLog period="WEEK" />
        </TabPage>
        <TabPage>
          <PeriodLog period="MONTH" />
        </TabPage>
        <TabPage>
          <PeriodLog period="ALL" />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
