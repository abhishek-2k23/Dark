import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { GatePass } from "@/components/GatePass";
import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { TabPage } from "@/components/TabPage";
import { VisitorRow } from "@/components/VisitorRow";
import {
  Badge,
  Button,
  Card,
  Screen,
  SegmentedControl,
  SwipeTabs,
  Text,
} from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { confirmAction } from "@/utils/confirm";
import { preApprovalStatusTone } from "@/utils/domain";
import { formatDateTime } from "@/utils/format";

type Tab = "pending" | "history" | "passes";
type Period = "TODAY" | "WEEK" | "MONTH" | "ALL";

function PendingList() {
  const { t } = useTranslation();
  const router = useRouter();
  const q = trpc.visitor.listPending.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (!q.data?.length)
    return (
      <EmptyState
        icon="shield-checkmark-outline"
        title={t("visitors.noPending")}
        body={t("visitors.noPendingBody")}
      />
    );

  return (
    <View className="gap-3">
      {q.data.map((v) => (
        <VisitorRow
          key={v.id}
          visitor={v}
          onPress={() => router.push(`/(resident)/visitors/${v.id}`)}
        />
      ))}
    </View>
  );
}

function HistoryList() {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("TODAY");
  const q = trpc.visitor.history.useInfiniteQuery(
    { period, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View className="gap-4">
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
              onPress={() => router.push(`/(resident)/visitors/${v.id}`)}
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
    </View>
  );
}

function PassesList() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = trpc.guestPreApproval.list.useQuery({ limit: 50 });

  const cancel = trpc.guestPreApproval.cancel.useMutation({
    onSuccess: () => {
      showToast(t("passes.cancelledToast"), "info");
      void utils.guestPreApproval.list.invalidate();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (!q.data?.items.length)
    return (
      <EmptyState
        icon="qr-code-outline"
        title={t("passes.empty")}
        body={t("passes.emptyBody")}
      />
    );

  return (
    <View className="gap-3">
      {q.data.items.map((p) => {
        const open = expanded === p.id;

        // An open, usable pass shows as the ticket itself — rendered outside a
        // Card because its torn notches are painted in the screen's background
        // colour and would read wrong against a card surface.
        if (open && p.status === "ACTIVE") {
          return (
            <View key={p.id} className="gap-3">
              <GatePass
                guestName={p.guestName}
                qrCode={p.qrCode}
                validFrom={p.validFrom}
                validTo={p.validTo}
                vehicleNumber={p.vehicleNumber}
                status={t(`enums.preApprovalStatus.${p.status}`)}
                statusTone={preApprovalStatusTone[p.status] ?? "neutral"}
              />
              <View className="flex-row gap-2">
                <Button
                  label={t("passes.collapse")}
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onPress={() => setExpanded(null)}
                />
                <Button
                  label={t("passes.cancel")}
                  variant="dangerSoft"
                  size="sm"
                  className="flex-1"
                  loading={cancel.isPending}
                  onPress={() =>
                    confirmAction({
                      title: t("passes.cancelConfirmTitle"),
                      message: t("passes.cancelConfirmMessage"),
                      confirmLabel: t("passes.cancel"),
                      cancelLabel: t("common.keep"),
                      onConfirm: () => cancel.mutate({ preApprovalId: p.id }),
                    })
                  }
                />
              </View>
            </View>
          );
        }

        return (
          <Card
            key={p.id}
            onPress={() => setExpanded(open ? null : p.id)}
            className="gap-3"
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-0.5">
                <Text variant="title" numberOfLines={1}>
                  {p.guestName}
                </Text>
                <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                  {formatDateTime(p.validFrom)} → {formatDateTime(p.validTo)}
                </Text>
              </View>
              <Badge
                label={t(`enums.preApprovalStatus.${p.status}`)}
                tone={preApprovalStatusTone[p.status] ?? "neutral"}
                uppercase
                size="sm"
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

export default function VisitorsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");

  return (
    <Screen padded={false} contentClassName="pt-3">
      <View className="gap-4 px-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text variant="h1">{t("visitors.title")}</Text>
            <Text variant="body" color="secondary">
              {t("visitors.subtitle")}
            </Text>
          </View>
        </View>

        <Button
          label={t("dashboard.preApproveGuest")}
          variant="primary"
          leftIcon="person-add-outline"
          onPress={() => router.push("/(resident)/visitors/pre-approve")}
          fullWidth
        />
      </View>

      <SwipeTabs
        value={tab}
        onChange={setTab}
        tabsClassName="mx-5 mb-1 mt-4"
        options={[
          { value: "pending", label: t("visitors.pending") },
          { value: "history", label: t("visitors.history") },
          { value: "passes", label: t("visitors.passes") },
        ]}
      >
        <TabPage>
          <PendingList />
        </TabPage>
        <TabPage>
          <HistoryList />
        </TabPage>
        <TabPage>
          <PassesList />
        </TabPage>
      </SwipeTabs>
    </Screen>
  );
}
