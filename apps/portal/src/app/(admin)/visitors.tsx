import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { EmptyState, ErrorState, Loading } from "@/components/ListState";
import { StackHeader } from "@/components/StackHeader";
import { TabPage } from "@/components/TabPage";
import { VisitorRow } from "@/components/VisitorRow";
import { Button, Screen, SwipeTabs, Text, type SegmentOption } from "@/components/ui";
import { downloadFile, DownloadUnavailableError } from "@/lib/download";
import { shareExportFile, SharingUnavailableError } from "@/lib/share";
import { trpc } from "@/lib/trpc";
import {
  buildVisitorLogPdf,
  visitorLogFileName,
  type VisitorLogPdfRow,
} from "@/lib/visitorLogPdf";
import { useUIStore } from "@/stores/uiStore";
import { formatDateTime, formatTime } from "@/utils/format";

type Period = "TODAY" | "WEEK" | "MONTH" | "ALL";

/**
 * Rows to pull into one PDF. The export pages through visitor.history rather
 * than exporting only what's on screen, but it still needs a ceiling — a
 * society with years of ALL-time history would otherwise pull forever.
 */
const EXPORT_MAX_ROWS = 2000;
const EXPORT_PAGE_SIZE = 100;

const PERIOD_SLUG: Record<Period, string> = {
  TODAY: "today",
  WEEK: "this-week",
  MONTH: "this-month",
  ALL: "all-time",
};

/** The visitor history for one time window; each pager page owns its query. */
function PeriodLog({ period }: { period: Period }) {
  const { t } = useTranslation();

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
        <VisitorRow key={v.id} visitor={v} />
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

export default function AdminVisitorLog() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [period, setPeriod] = useState<Period>("MONTH");
  const [exporting, setExporting] = useState<null | "download" | "share">(null);

  const society = trpc.society.get.useQuery();

  const options: SegmentOption<Period>[] = [
    { value: "TODAY", label: t("visitors.today") },
    { value: "WEEK", label: t("visitors.week") },
    { value: "MONTH", label: t("visitors.month") },
    { value: "ALL", label: t("visitors.all") },
  ];

  const periodLabel: Record<Period, string> = {
    TODAY: t("visitors.today"),
    WEEK: t("visitors.week"),
    MONTH: t("visitors.month"),
    ALL: t("visitors.all"),
  };

  /** Walk the cursor until the window is exhausted or the ceiling is hit. */
  async function fetchAllRows(): Promise<VisitorLogPdfRow[]> {
    const rows: VisitorLogPdfRow[] = [];
    let cursor: string | undefined;

    do {
      const page = await utils.visitor.history.fetch({
        period,
        limit: EXPORT_PAGE_SIZE,
        cursor,
      });
      for (const v of page.items) {
        rows.push({
          createdAt: v.createdAt,
          name: v.name,
          phone: v.phone,
          towerName: v.towerName,
          flatNumber: v.flatNumber,
          purpose: t(`enums.visitorPurpose.${v.purpose}`),
          status: t(`enums.visitorStatus.${v.status}`),
          entryTime: v.entryTime,
          exitTime: v.exitTime,
          vehicleNumber: v.vehicleNumber,
        });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor && rows.length < EXPORT_MAX_ROWS);

    return rows.slice(0, EXPORT_MAX_ROWS);
  }

  async function exportPdf(mode: "download" | "share") {
    setExporting(mode);
    try {
      const rows = await fetchAllRows();
      if (rows.length === 0) {
        showToast(t("admin.visitorLog.nothingToExport"), "info");
        return;
      }

      const file = await buildVisitorLogPdf({
        fileName: visitorLogFileName(PERIOD_SLUG[period]),
        title: t("admin.visitorLog.pdfTitle"),
        societyName: society.data?.name ?? t("app.name"),
        periodLabel: periodLabel[period],
        generatedLabel: t("admin.visitorLog.generatedAt", {
          when: formatDateTime(new Date()),
        }),
        countLabel: t("admin.visitorLog.visitorCount", { count: rows.length }),
        emptyLabel: t("visitors.noHistory"),
        footerNote: t("admin.visitorLog.pdfFooter", { society: society.data?.name ?? "" }),
        columns: {
          dateTime: t("admin.visitorLog.colDateTime"),
          visitor: t("admin.visitorLog.colVisitor"),
          flat: t("admin.visitorLog.colFlat"),
          purpose: t("admin.visitorLog.colPurpose"),
          status: t("admin.visitorLog.colStatus"),
          entry: t("admin.visitorLog.colEntry"),
          exit: t("admin.visitorLog.colExit"),
          vehicle: t("admin.visitorLog.colVehicle"),
        },
        rows,
        formatDateTime: (iso) => formatDateTime(iso),
        formatTime: (iso) => formatTime(iso),
      });

      if (mode === "share") {
        await shareExportFile(file, t("admin.visitorLog.pdfTitle"));
      } else {
        const result = await downloadFile(file, {
          title: t("downloads.completeTitle"),
          body: t("downloads.completeBody", { file: file.fileName }),
        });
        // Backing out of the Android folder picker is a choice, not a failure.
        if (!result.cancelled) showToast(t("downloads.saved"), "success");
      }

      if (rows.length === EXPORT_MAX_ROWS) {
        showToast(t("admin.visitorLog.truncated", { count: EXPORT_MAX_ROWS }), "info");
      }
    } catch (err) {
      showToast(
        err instanceof SharingUnavailableError || err instanceof DownloadUnavailableError
          ? t("downloads.unavailable")
          : t("admin.visitorLog.exportFailed"),
        "error",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <Screen padded={false} contentClassName="pt-1">
      <View className="gap-1 px-5">
        <StackHeader
          title={t("admin.visitorLog.title")}
          right={
            <View className="flex-row gap-2">
              <Button
                label={t("admin.visitorLog.export")}
                variant="secondary"
                size="sm"
                leftIcon="download-outline"
                loading={exporting === "download"}
                disabled={exporting !== null}
                onPress={() => void exportPdf("download")}
              />
              <Button
                label=""
                variant="outline"
                size="sm"
                leftIcon="share-social-outline"
                accessibilityLabel={t("admin.visitorLog.shareA11y")}
                loading={exporting === "share"}
                disabled={exporting !== null}
                onPress={() => void exportPdf("share")}
              />
            </View>
          }
        />
        <Text variant="body" color="secondary">
          {t("admin.visitorLog.subtitle")}
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
