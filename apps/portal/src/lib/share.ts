import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { ExportFile } from "./exportFile";

/**
 * Handing a generated file to the OS share sheet — "download or share" on
 * mobile is the same gesture, since the sheet already offers Save to Files,
 * Drive, WhatsApp and mail in one list.
 *
 * Used by the visitor-log PDF export and the blank resident-import template.
 */

/** Thrown when the platform has no share sheet (notably web). */
export class SharingUnavailableError extends Error {
  constructor() {
    super("Sharing is not available on this device");
    this.name = "SharingUnavailableError";
  }
}

/**
 * Filenames end up in the user's Files app and in whatever they share to, so
 * strip anything a filesystem would object to and keep it short.
 */
export function safeFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file"
  );
}

/**
 * Write a generated file into the cache directory and open the share sheet.
 *
 * Cache rather than documents on purpose: a shared copy is throwaway, and the
 * OS may reclaim it once the user has sent it wherever they wanted. Files the
 * user asked to *keep* go through `download.ts` instead, which writes somewhere
 * permanent and visible.
 */
export async function shareExportFile(
  file: ExportFile,
  dialogTitle: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();

  const uri = `${FileSystem.cacheDirectory}${safeFileName(file.fileName)}`;
  await FileSystem.writeAsStringAsync(uri, file.contents, {
    encoding:
      file.encoding === "base64" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: file.mimeType,
    dialogTitle,
    UTI: file.uti,
  });
}
