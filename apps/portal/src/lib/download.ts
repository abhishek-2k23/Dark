import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { ExportFile } from "./exportFile";
import {
  ANDROID_DOWNLOAD_CHANNEL_ID,
  DOWNLOAD_NOTIFICATION_KIND,
  ensureNotificationPermission,
} from "./push";
import { safeFileName } from "./share";

/**
 * Saving a generated file to the device — a real download, not a share sheet.
 *
 * The two platforms disagree about what "download" even means, so this papers
 * over the difference rather than pretending it isn't there:
 *
 * **Android** has a user-visible filesystem, but since Android 10 an app can
 * only write outside its sandbox through MediaStore or the Storage Access
 * Framework — there is no way to drop a file straight into /Download. So the
 * first download opens the SAF picker *already sitting in the phone's Downloads
 * folder*, making it a single "Use this folder" tap; the grant is then
 * persisted and every later download writes straight there with no prompt.
 *
 * **iOS** sandboxes apps and has no shared Downloads folder. The nearest true
 * equivalent is the app's own Documents directory, which the Files app exposes
 * as "On My iPhone → Prangan" because app.config.ts sets `UIFileSharingEnabled`
 * and `LSSupportsOpeningDocumentsInPlace`. Writing there *is* the download.
 *
 * Either way a notification is raised when the file lands, and tapping it opens
 * the file. Sharing is deliberately a separate action — see `share.ts`.
 */

/** Where the user chose to keep downloads on Android (a SAF tree URI). */
const SAF_DIRECTORY_KEY = "downloads.saf.directoryUri";

/** Notification copy, already localised by the caller. */
export interface DownloadNotification {
  title: string;
  body: string;
}

export interface DownloadResult {
  /** Where it landed. A SAF content:// URI on Android, file:// on iOS. */
  uri: string;
  /** True when the user declined the Android folder prompt. */
  cancelled: boolean;
}

/** The user refused the folder grant, or the platform can't save at all. */
export class DownloadUnavailableError extends Error {
  constructor(message = "Downloads are not available on this device") {
    super(message);
    this.name = "DownloadUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Android — Storage Access Framework
// ---------------------------------------------------------------------------

const SAF = FileSystem.StorageAccessFramework;

/**
 * The phone's own Downloads folder, as the SAF picker's starting point.
 *
 * Passing this means the one-time prompt opens *in* Downloads rather than at
 * the storage root, so the user confirms the obvious answer instead of
 * navigating to it. It is only a hint — the picker still lets them choose
 * elsewhere, and some OEM file pickers ignore it entirely.
 */
const DOWNLOADS_HINT = SAF.getUriForDirectoryInRoot("Download");

/**
 * The folder to write into, asking once and remembering the answer.
 *
 * A stored grant can go stale — the folder gets deleted, or the OS revokes
 * permission after an uninstall/restore. Rather than fail the download, a stale
 * grant is dropped and the picker is shown again.
 */
async function androidDirectory(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(SAF_DIRECTORY_KEY);
  if (saved) {
    try {
      await SAF.readDirectoryAsync(saved);
      return saved;
    } catch {
      await AsyncStorage.removeItem(SAF_DIRECTORY_KEY);
    }
  }

  const permission = await SAF.requestDirectoryPermissionsAsync(DOWNLOADS_HINT);
  if (!permission.granted) return null;
  await AsyncStorage.setItem(SAF_DIRECTORY_KEY, permission.directoryUri);
  return permission.directoryUri;
}

function encodingFor(file: ExportFile): FileSystem.EncodingType {
  return file.encoding === "base64"
    ? FileSystem.EncodingType.Base64
    : FileSystem.EncodingType.UTF8;
}

async function saveOnAndroid(file: ExportFile): Promise<DownloadResult> {
  const directoryUri = await androidDirectory();
  if (!directoryUri) return { uri: "", cancelled: true };

  // SAF appends the extension from the mime type, so hand it the stem only —
  // otherwise you get "report.pdf.pdf".
  const stem = file.fileName.replace(/\.[^.]+$/, "");
  const uri = await SAF.createFileAsync(directoryUri, stem, file.mimeType);
  await FileSystem.writeAsStringAsync(uri, file.contents, { encoding: encodingFor(file) });
  return { uri, cancelled: false };
}

// ---------------------------------------------------------------------------
// iOS — the app's Files-visible Documents directory
// ---------------------------------------------------------------------------

async function saveOnIOS(file: ExportFile): Promise<DownloadResult> {
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new DownloadUnavailableError();

  const uri = `${directory}${safeFileName(file.fileName)}`;
  await FileSystem.writeAsStringAsync(uri, file.contents, { encoding: encodingFor(file) });
  return { uri, cancelled: false };
}

// ---------------------------------------------------------------------------

/**
 * Save a file to the device and raise a "saved" notification.
 *
 * Resolves with `cancelled: true` if the user backed out of the Android folder
 * picker — that is a choice, not a failure, so callers should stay quiet.
 */
export async function downloadFile(
  file: ExportFile,
  notification: DownloadNotification,
): Promise<DownloadResult> {
  const result = Platform.OS === "android" ? await saveOnAndroid(file) : await saveOnIOS(file);

  if (result.cancelled) return result;

  // Best-effort: a refused notification permission must not fail a download
  // that has already succeeded.
  if (await ensureNotificationPermission()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: {
          kind: DOWNLOAD_NOTIFICATION_KIND,
          uri: result.uri,
          mimeType: file.mimeType,
        },
        ...(Platform.OS === "android" ? { channelId: ANDROID_DOWNLOAD_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  }

  return result;
}

/**
 * Open a downloaded file in whatever app handles it. Used by the notification
 * tap and by the "open" affordance after a download.
 *
 * Android needs an explicit VIEW intent with a content:// URI; iOS has no
 * general "open in place" API, so the share sheet is the way in — which is the
 * same gesture Files itself offers.
 */
export async function openDownloadedFile(uri: string, mimeType: string): Promise<void> {
  if (Platform.OS === "android") {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: uri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: mimeType,
    });
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
  }
}

/**
 * Forget the Android folder grant, so the next download asks again. Exposed for
 * a "change download folder" affordance; harmless on iOS.
 */
export async function resetDownloadFolder(): Promise<void> {
  await AsyncStorage.removeItem(SAF_DIRECTORY_KEY);
}
