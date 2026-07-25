import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import {
  Button,
  Icon,
  SegmentedControl,
  Sheet,
  Text,
  type SegmentOption,
} from "@/components/ui";
import { downloadFile, DownloadUnavailableError } from "@/lib/download";
import type { ExportFile } from "@/lib/exportFile";
import { shareExportFile, SharingUnavailableError } from "@/lib/share";
import { useUIStore } from "@/stores/uiStore";

/**
 * The one place the app asks "what do you want out of this screen, and where
 * should it go?" — section filter, file format, then save or share.
 *
 * It lives in a sheet rather than inline on the screen because an export is an
 * occasional errand, not part of reading the page: parking it behind a header
 * icon keeps the screen about its subject, and gives the filter room to breathe
 * when it is opened.
 *
 * Generic over the section type so any screen can hand it a set of sections and
 * a builder; it owns the selection, the busy state and the error toasts.
 */

export type ExportFormat = "pdf" | "csv";

export interface ExportSheetProps<S extends string> {
  visible: boolean;
  onClose: () => void;
  /** Sheet heading, e.g. "Download report". */
  title: string;
  /** One line under the heading explaining what will be produced. */
  subtitle?: string;
  /** Every section on offer, in the order they should appear. */
  sections: readonly S[];
  sectionLabel: (section: S) => string;
  /** Renders the chosen sections in the chosen format. */
  build: (params: { format: ExportFormat; sections: S[] }) => Promise<ExportFile>;
  /** Dialog title for the OS share sheet. */
  shareTitle: string;
}

/** A filter pill. Checked state carries a tick as well as colour. */
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-80 ${
        active ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
    >
      {active && <Icon name="checkmark" size={13} color="primary" />}
      <Text variant="caption" color={active ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ExportSheet<S extends string>({
  visible,
  onClose,
  title,
  subtitle,
  sections,
  sectionLabel,
  build,
  shareTitle,
}: ExportSheetProps<S>) {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);

  const [selected, setSelected] = useState<S[]>([...sections]);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [busy, setBusy] = useState<null | "download" | "share">(null);

  const allSelected = selected.length === sections.length;

  const toggle = (section: S) =>
    setSelected((current) =>
      current.includes(section)
        ? current.filter((s) => s !== section)
        : // Rebuilt from `sections` so the order always matches the report,
          // however the user clicked their way to this set.
          sections.filter((s) => current.includes(s) || s === section),
    );

  const formatOptions: SegmentOption<ExportFormat>[] = [
    { value: "pdf", label: t("downloads.formatPdf") },
    { value: "csv", label: t("downloads.formatCsv") },
  ];

  async function run(mode: "download" | "share") {
    if (selected.length === 0) {
      showToast(t("downloads.pickOne"), "info");
      return;
    }
    setBusy(mode);
    try {
      const file = await build({ format, sections: selected });
      if (mode === "share") {
        await shareExportFile(file, shareTitle);
        onClose();
        return;
      }
      const result = await downloadFile(file, {
        title: t("downloads.completeTitle"),
        body: t("downloads.completeBody", { file: file.fileName }),
      });
      // Backing out of the Android folder picker is a choice, not a failure —
      // stay open so the user can simply try again.
      if (!result.cancelled) {
        showToast(t("downloads.saved"), "success");
        onClose();
      }
    } catch (err) {
      showToast(
        err instanceof SharingUnavailableError || err instanceof DownloadUnavailableError
          ? t("downloads.unavailable")
          : t("downloads.failed"),
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View className="gap-2">
        <Text variant="caption" color="tertiary">
          {t("downloads.include")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Chip
            label={t("visitors.all")}
            active={allSelected}
            onPress={() => setSelected(allSelected ? [] : [...sections])}
          />
          {sections.map((section) => (
            <Chip
              key={section}
              label={sectionLabel(section)}
              active={selected.includes(section)}
              onPress={() => toggle(section)}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text variant="caption" color="tertiary">
          {t("downloads.format")}
        </Text>
        <SegmentedControl
          options={formatOptions}
          value={format}
          onChange={setFormat}
        />
      </View>

      <View className="gap-2.5">
        <Button
          label={t("downloads.download")}
          leftIcon="download-outline"
          size="lg"
          fullWidth
          loading={busy === "download"}
          disabled={busy !== null}
          onPress={() => void run("download")}
        />
        <Button
          label={t("downloads.share")}
          leftIcon="share-social-outline"
          variant="outline"
          size="lg"
          fullWidth
          loading={busy === "share"}
          disabled={busy !== null}
          onPress={() => void run("share")}
        />
      </View>
    </Sheet>
  );
}
