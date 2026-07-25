import type { ServerRouter } from "@repo/trpc/server";
import type { inferRouterOutputs } from "@trpc/server";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SectionHeader } from "@/components/SectionHeader";
import { StackHeader } from "@/components/StackHeader";
import { Badge, Button, Card, FieldLabel, Screen, Switch, Text } from "@/components/ui";
import { SharingUnavailableError, writeAndShareText } from "@/lib/share";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { confirmAction } from "@/utils/confirm";

type RouterOutputs = inferRouterOutputs<ServerRouter>;
type ImportPreview = RouterOutputs["resident"]["importPreview"];
type ImportRow = ImportPreview["rows"][number];

type FlatType = "ONE_RK" | "ONE_BHK" | "TWO_BHK" | "THREE_BHK" | "FOUR_BHK" | "OTHER";

const FLAT_TYPES: FlatType[] = [
  "ONE_RK",
  "ONE_BHK",
  "TWO_BHK",
  "THREE_BHK",
  "FOUR_BHK",
  "OTHER",
];

/** Extensions the backend parser accepts — mirrors readRows() in import.service.ts. */
const ACCEPTED_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/comma-separated-values",
  "application/csv",
];

/**
 * The blank register an admin fills in. Kept as CSV rather than xlsx so it can
 * be generated on-device with no spreadsheet-writing dependency — Excel, Google
 * Sheets and Numbers all open it and will save back to .xlsx if the admin
 * prefers, which the importer also reads.
 */
const TEMPLATE_CSV = [
  "Name,Email,Phone,Tower,Flat Number,Floor,Flat Type",
  "Ravi Kumar,ravi@example.com,9876543210,A,A-304,3,2BHK",
  "Sita Kumar,sita@example.com,9876543211,A,A-304,3,2BHK",
  "Anil Verma,,9876543212,B,B-101,1,1BHK",
].join("\r\n");

/** How many problem rows to render before falling back to a count. */
const MAX_ISSUE_ROWS = 40;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-4 py-2 active:opacity-80 ${
        active ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      <Text variant="subtitle" color={active ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

function CountTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "warning" | "danger";
}) {
  const color = tone === "success" ? "success" : tone === "warning" ? "warning" : "danger";
  return (
    <Card variant="elevated" className="flex-1 items-center gap-0.5 py-3">
      <Text variant="h2" color={color}>
        {String(value)}
      </Text>
      <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

function RowIssues({ row }: { row: ImportRow }) {
  const { t } = useTranslation();
  const tone = row.status === "ERROR" ? "danger" : row.status === "SKIPPED" ? "neutral" : "warning";
  const identity = [row.name, row.email ?? row.phone].filter(Boolean).join(" · ");

  return (
    <Card className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Badge label={t("admin.import.rowNumber", { row: row.rowNumber })} tone={tone} size="sm" />
        <Text variant="subtitle" numberOfLines={1} className="shrink">
          {identity || t("admin.import.blankRow")}
        </Text>
      </View>
      {row.issues.map((issue, index) => (
        <Text key={`${issue.code}-${index}`} variant="caption" color="secondary">
          • {issue.message}
        </Text>
      ))}
    </Card>
  );
}

export default function ImportResidents() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [createMissingFlats, setCreateMissingFlats] = useState(true);
  const [defaultFlatType, setDefaultFlatType] = useState<FlatType>("TWO_BHK");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sharing, setSharing] = useState(false);

  // Any change to the file or the options invalidates a preview the admin is
  // looking at — never let them commit against a stale report.
  const resetPreview = () => setPreview(null);

  const previewMutation = trpc.resident.importPreview.useMutation({
    onSuccess: setPreview,
    onError: (e) => {
      setPreview(null);
      showToast(e.message, "error");
    },
  });

  const commitMutation = trpc.resident.importCommit.useMutation({
    onSuccess: (result) => {
      void utils.resident.list.invalidate();
      void utils.flat.list.invalidate();
      void utils.tower.list.invalidate();
      showToast(t("admin.import.done", { count: result.importedCount }), "success");
      router.back();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  const busy = previewMutation.isPending || commitMutation.isPending;

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_MIME,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;

    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setFile({ name: asset.name, base64 });
      resetPreview();
    } catch {
      showToast(t("admin.import.readFailed"), "error");
    }
  }

  async function downloadTemplate() {
    setSharing(true);
    try {
      await writeAndShareText({
        fileName: "prangan-residents-template.csv",
        contents: TEMPLATE_CSV,
        mimeType: "text/csv",
        dialogTitle: t("admin.import.templateTitle"),
        UTI: "public.comma-separated-values-text",
      });
    } catch (err) {
      showToast(
        err instanceof SharingUnavailableError
          ? t("admin.import.sharingUnavailable")
          : t("admin.import.templateFailed"),
        "error",
      );
    } finally {
      setSharing(false);
    }
  }

  function runPreview() {
    if (!file) return;
    previewMutation.mutate({
      fileName: file.name,
      fileBase64: file.base64,
      createMissingFlats,
      defaultFlatType,
    });
  }

  function runCommit() {
    if (!file || !preview) return;
    confirmAction({
      title: t("admin.import.confirmTitle"),
      message: t("admin.import.confirmMessage", {
        count: preview.readyCount,
        towers: preview.towersToCreate.length,
        flats: preview.flatsToCreate,
      }),
      confirmLabel: t("admin.import.confirmCta", { count: preview.readyCount }),
      cancelLabel: t("common.cancel"),
      tone: "primary",
      onConfirm: () =>
        commitMutation.mutate({
          fileName: file.name,
          fileBase64: file.base64,
          createMissingFlats,
          defaultFlatType,
        }),
    });
  }

  // Clean rows are the boring majority; only surface what needs a decision.
  const issueRows = preview?.rows.filter((row) => row.issues.length > 0) ?? [];

  return (
    <Screen scroll contentClassName="gap-5 pb-10">
      <StackHeader title={t("admin.import.title")} />

      <Text variant="body" color="secondary">
        {t("admin.import.intro")}
      </Text>

      {/* Expected format + blank template */}
      <Card className="gap-3">
        <Text variant="subtitle">{t("admin.import.columnsTitle")}</Text>
        <Text variant="caption" color="secondary">
          {t("admin.import.columnsRequired")}
        </Text>
        <Text variant="caption" color="secondary">
          {t("admin.import.columnsOptional")}
        </Text>
        <Text variant="caption" color="tertiary">
          {t("admin.import.columnsHint")}
        </Text>
        <Button
          label={t("admin.import.downloadTemplate")}
          variant="outline"
          size="sm"
          leftIcon="download-outline"
          loading={sharing}
          onPress={downloadTemplate}
        />
      </Card>

      {/* File */}
      <Card className="gap-3">
        <FieldLabel label={t("admin.import.fileLabel")} required />
        {file ? (
          <View className="flex-row items-center gap-2">
            <Badge label={t("admin.import.fileSelected")} tone="primary" size="sm" />
            <Text variant="body" numberOfLines={1} className="shrink">
              {file.name}
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="tertiary">
            {t("admin.import.noFile")}
          </Text>
        )}
        <Button
          label={file ? t("admin.import.changeFile") : t("admin.import.chooseFile")}
          variant="secondary"
          size="sm"
          leftIcon="document-attach-outline"
          disabled={busy}
          onPress={pickFile}
        />
      </Card>

      {/* Options */}
      {file && (
        <Card className="gap-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text variant="subtitle">{t("admin.import.createMissing")}</Text>
              <Text variant="caption" color="secondary">
                {t("admin.import.createMissingHint")}
              </Text>
            </View>
            <Switch
              value={createMissingFlats}
              onValueChange={(next) => {
                setCreateMissingFlats(next);
                resetPreview();
              }}
              disabled={busy}
            />
          </View>

          {createMissingFlats && (
            <View className="gap-2">
              <FieldLabel label={t("admin.import.defaultFlatType")} />
              <Text variant="caption" color="secondary">
                {t("admin.import.defaultFlatTypeHint")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {FLAT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={t(`enums.flatType.${type}`)}
                    active={defaultFlatType === type}
                    onPress={() => {
                      setDefaultFlatType(type);
                      resetPreview();
                    }}
                  />
                ))}
              </View>
            </View>
          )}
        </Card>
      )}

      {file && (
        <Button
          label={t("admin.import.check")}
          leftIcon="scan-outline"
          loading={previewMutation.isPending}
          disabled={busy}
          onPress={runPreview}
        />
      )}

      {/* Report */}
      {preview && (
        <View className="gap-4">
          <SectionHeader title={t("admin.import.reportTitle")} />

          <View className="flex-row gap-3">
            <CountTile
              value={preview.readyCount}
              label={t("admin.import.readyLabel")}
              tone="success"
            />
            <CountTile
              value={preview.skippedCount}
              label={t("admin.import.skippedLabel")}
              tone="warning"
            />
            <CountTile
              value={preview.errorCount}
              label={t("admin.import.errorLabel")}
              tone="danger"
            />
          </View>

          <Card className="gap-1.5">
            <Text variant="caption" color="secondary">
              {t("admin.import.rowsScanned", { count: preview.totalRows })}
            </Text>
            {preview.towersToCreate.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("admin.import.willCreateTowers", {
                  count: preview.towersToCreate.length,
                  names: preview.towersToCreate.join(", "),
                })}
              </Text>
            )}
            {preview.flatsToCreate > 0 && (
              <Text variant="caption" color="secondary">
                {t("admin.import.willCreateFlats", { count: preview.flatsToCreate })}
              </Text>
            )}
            {preview.noLoginCount > 0 && (
              <Text variant="caption" color="warning">
                {t("admin.import.noLoginWarning", { count: preview.noLoginCount })}
              </Text>
            )}
            <Text variant="caption" color="tertiary">
              {t("admin.import.claimNote")}
            </Text>
          </Card>

          {issueRows.length > 0 && (
            <View className="gap-3">
              <SectionHeader title={t("admin.import.issuesTitle")} />
              {issueRows.slice(0, MAX_ISSUE_ROWS).map((row) => (
                <RowIssues key={row.rowNumber} row={row} />
              ))}
              {issueRows.length > MAX_ISSUE_ROWS && (
                <Text variant="caption" color="tertiary" align="center">
                  {t("admin.import.moreIssues", {
                    count: issueRows.length - MAX_ISSUE_ROWS,
                  })}
                </Text>
              )}
            </View>
          )}

          {preview.readyCount > 0 ? (
            <Button
              label={t("admin.import.commit", { count: preview.readyCount })}
              leftIcon="cloud-upload-outline"
              loading={commitMutation.isPending}
              disabled={busy}
              onPress={runCommit}
            />
          ) : (
            <Text variant="caption" color="danger" align="center">
              {t("admin.import.nothingToImport")}
            </Text>
          )}
        </View>
      )}
    </Screen>
  );
}
