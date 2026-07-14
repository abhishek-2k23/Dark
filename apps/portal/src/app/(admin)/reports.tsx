import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState, Loading } from "@/components/ListState";
import { SectionHeader } from "@/components/SectionHeader";
import { StackHeader } from "@/components/StackHeader";
import { Card, IconCircle, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/utils/format";

/** A labelled horizontal proportion bar. */
function Bar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text variant="bodySmall" color="secondary">
          {label}
        </Text>
        <Text variant="subtitle">{value}</Text>
      </View>
      <View className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
        <View
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }}
        />
      </View>
    </View>
  );
}

function BigStat({
  icon,
  tone,
  value,
  label,
}: {
  icon: "walk-outline" | "cash-outline" | "checkmark-done-outline";
  tone: "primary" | "success" | "accent";
  value: string;
  label: string;
}) {
  return (
    <Card variant="elevated" className="flex-1 items-center gap-1 py-4">
      <IconCircle name={icon} tone={tone} size={40} />
      <Text variant="h2">{value}</Text>
      <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

export default function Reports() {
  const { t } = useTranslation();

  const visitors = trpc.visitor.history.useQuery({ period: "WEEK", limit: 100 });
  const dues = trpc.due.list.useQuery({ limit: 100 });
  const tickets = trpc.ticket.list.useQuery({ limit: 100 });

  const loading =
    visitors.isLoading || dues.isLoading || tickets.isLoading;
  const error = visitors.error ?? dues.error ?? tickets.error;

  // Visitor breakdown (this week).
  const v = visitors.data?.items ?? [];
  const vBy = (s: string) => v.filter((x) => x.status === s).length;

  // Maintenance collection.
  const d = dues.data?.items ?? [];
  const collected = d
    .filter((x) => x.status === "PAID")
    .reduce((sum, x) => sum + x.amount, 0);
  const billed = d.reduce((sum, x) => sum + x.amount, 0);
  const collectionPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  // Complaint resolution.
  const tk = tickets.data?.items ?? [];
  const tBy = (s: string) => tk.filter((x) => x.status === s).length;
  const resolved = tBy("RESOLVED") + tBy("CLOSED");
  const resolutionPct = tk.length > 0 ? Math.round((resolved / tk.length) * 100) : 0;

  return (
    <Screen scroll contentClassName="gap-6 pb-8">
      <StackHeader title={t("admin.reports")} />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <>
          <View className="flex-row gap-3">
            <BigStat
              icon="walk-outline"
              tone="primary"
              value={String(v.length)}
              label={t("admin.visitorsThisWeek")}
            />
            <BigStat
              icon="cash-outline"
              tone="success"
              value={`${collectionPct}%`}
              label={t("admin.collectionRate")}
            />
            <BigStat
              icon="checkmark-done-outline"
              tone="accent"
              value={`${resolutionPct}%`}
              label={t("admin.resolutionRate")}
            />
          </View>

          {/* Visitor trends */}
          <View className="gap-3">
            <SectionHeader title={t("admin.visitorTrends")} />
            <Card className="gap-3">
              <Bar
                label={t("enums.visitorStatus.APPROVED")}
                value={vBy("APPROVED")}
                total={v.length}
                color="bg-success"
              />
              <Bar
                label={t("enums.visitorStatus.PENDING")}
                value={vBy("PENDING")}
                total={v.length}
                color="bg-warning"
              />
              <Bar
                label={t("enums.visitorStatus.DENIED")}
                value={vBy("DENIED")}
                total={v.length}
                color="bg-danger"
              />
              <Bar
                label={t("enums.visitorStatus.EXPIRED")}
                value={vBy("EXPIRED")}
                total={v.length}
                color="bg-primary"
              />
              <Text variant="caption" color="tertiary">
                {t("admin.last7days")}
              </Text>
            </Card>
          </View>

          {/* Collection */}
          <View className="gap-3">
            <SectionHeader title={t("admin.maintenanceCollection")} />
            <Card className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text variant="body" color="secondary">
                  {t("admin.collected")}
                </Text>
                <Text variant="title" color="success">
                  {formatMoney(collected)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text variant="body" color="secondary">
                  {t("admin.billed")}
                </Text>
                <Text variant="title">{formatMoney(billed)}</Text>
              </View>
              <View className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <View
                  className="h-full rounded-full bg-success"
                  style={{ width: `${collectionPct}%` }}
                />
              </View>
              <Text variant="caption" color="tertiary">
                {t("admin.overdueCount", { count: d.filter((x) => x.status === "OVERDUE").length })}
              </Text>
            </Card>
          </View>

          {/* Complaints */}
          <View className="gap-3">
            <SectionHeader title={t("admin.complaintBreakdown")} />
            <Card className="gap-3">
              <Bar
                label={t("enums.ticketStatus.OPEN")}
                value={tBy("OPEN")}
                total={tk.length}
                color="bg-warning"
              />
              <Bar
                label={t("enums.ticketStatus.IN_PROGRESS")}
                value={tBy("IN_PROGRESS")}
                total={tk.length}
                color="bg-primary"
              />
              <Bar
                label={t("enums.ticketStatus.RESOLVED")}
                value={tBy("RESOLVED")}
                total={tk.length}
                color="bg-success"
              />
              <Bar
                label={t("enums.ticketStatus.CLOSED")}
                value={tBy("CLOSED")}
                total={tk.length}
                color="bg-primary-strong"
              />
            </Card>
          </View>

          <Text variant="caption" color="tertiary" align="center">
            {t("admin.reportsNote")}
          </Text>
        </>
      )}
    </Screen>
  );
}
