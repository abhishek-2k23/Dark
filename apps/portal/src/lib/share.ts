import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

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

export async function shareFile(
  uri: string,
  options: { mimeType: string; dialogTitle: string; UTI?: string },
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();
  await Sharing.shareAsync(uri, options);
}

/**
 * Write text into the cache directory and open the share sheet on it.
 *
 * Cache rather than documents on purpose: these are throwaway exports, and the
 * OS is free to reclaim them once the user has saved the copy they wanted.
 */
export async function writeAndShareText(params: {
  fileName: string;
  contents: string;
  mimeType: string;
  dialogTitle: string;
  UTI?: string;
}): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();

  const uri = `${FileSystem.cacheDirectory}${safeFileName(params.fileName)}`;
  await FileSystem.writeAsStringAsync(uri, params.contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: params.mimeType,
    dialogTitle: params.dialogTitle,
    UTI: params.UTI,
  });
}
