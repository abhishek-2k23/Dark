import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import { api } from "./trpc";

/**
 * Image uploads. Mirrors the backend's two-step signed flow (@repo/cloudinary):
 *
 *   1. ask the API for a short-lived signature  (upload.getSignature)
 *   2. POST the file straight to Cloudinary with it
 *   3. hand the returned secure_url to whichever mutation stores it
 *
 * The API secret never reaches the device, and the backend re-validates the
 * URL's origin on write — so a tampered URL is rejected server-side even
 * though the upload itself bypasses our API.
 */

/** Must stay in sync with UploadKindEnum in packages/trpc .../upload/route.ts. */
export type UploadKind =
  | "AVATAR"
  | "VISITOR"
  | "TICKET"
  | "NOTICE"
  | "AMENITY"
  | "RECEIPT"
  | "LOGO";

export type PickSource = "camera" | "library";

export interface PickOptions {
  /** Show the crop/rotate editor after picking. */
  allowsEditing?: boolean;
  /** Locks the editor's crop box, e.g. [1, 1] for avatars. */
  aspect?: [number, number];
  /** How many images to allow; > 1 disables the editor (OS limitation). */
  selectionLimit?: number;
}

/**
 * Thrown when the user declines a camera/library permission. Callers show
 * this as a friendly toast rather than a crash — declining is a normal
 * choice, not an error condition.
 */
export class PermissionDeniedError extends Error {
  constructor(readonly source: PickSource) {
    super(`${source} permission denied`);
    this.name = "PermissionDeniedError";
  }
}

/** Cloudinary rejects the upload anyway; failing early gives a better message. */
const MAX_BYTES = 10 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`file is ${bytes} bytes, limit is ${MAX_BYTES}`);
    this.name = "FileTooLargeError";
  }
}

/**
 * Cloudinary took the request and refused it. Distinct from a transport
 * failure on purpose: `message` is Cloudinary's own words ("Invalid Signature",
 * "Stale request"), which the caller should show verbatim rather than collapse
 * into generic network copy — that hides the one fact that explains the failure.
 */
export class UploadFailedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: UploadKind,
  ) {
    super(message);
    this.name = "UploadFailedError";
  }
}

/**
 * Quality is deliberately lossy at the source: it cuts upload time on the
 * patchy mobile data a guard has at a gate, and every kind gets re-encoded by
 * a Cloudinary transformation on arrival regardless. Receipts are the
 * exception — see pickImage.
 */
const DEFAULT_QUALITY = 0.7;
const RECEIPT_QUALITY = 0.9;

/**
 * Prompt for the picker's permission. Returns false when the user declines;
 * `canAskAgain: false` means they declined permanently and only Settings can
 * undo it, which the caller surfaces.
 */
async function ensurePermission(source: PickSource): Promise<boolean> {
  const result =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return result.granted;
}

/**
 * Open the camera or library and return the picked assets. Empty array means
 * the user cancelled — a normal outcome, not an error.
 */
export async function pickImages(
  source: PickSource,
  kind: UploadKind,
  options: PickOptions = {},
): Promise<ImagePicker.ImagePickerAsset[]> {
  if (!(await ensurePermission(source))) throw new PermissionDeniedError(source);

  const { allowsEditing = true, aspect, selectionLimit = 1 } = options;
  const shared = {
    mediaTypes: "images" as const,
    quality: kind === "RECEIPT" ? RECEIPT_QUALITY : DEFAULT_QUALITY,
    // The editor only ever yields one asset, so it can't coexist with
    // multi-select. Requesting both makes the picker ignore the limit.
    allowsEditing: selectionLimit === 1 && allowsEditing,
    aspect,
    exif: false,
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(shared)
      : await ImagePicker.launchImageLibraryAsync({ ...shared, selectionLimit });

  if (result.canceled) return [];

  for (const asset of result.assets) {
    if (asset.fileSize !== undefined && asset.fileSize > MAX_BYTES) {
      throw new FileTooLargeError(asset.fileSize);
    }
  }
  return result.assets;
}

/** Single-image convenience wrapper. Null means cancelled. */
export async function pickImage(
  source: PickSource,
  kind: UploadKind,
  options: PickOptions = {},
): Promise<ImagePicker.ImagePickerAsset | null> {
  const assets = await pickImages(source, kind, { ...options, selectionLimit: 1 });
  return assets[0] ?? null;
}

/**
 * Cloudinary keys its `resource_type: image` check off the mime type, so a
 * wrong guess produces a stored file that 404s on delivery. Fall back to jpeg,
 * which is what the camera on both platforms actually produces.
 */
function mimeTypeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.fileName?.split(".").pop()?.toLowerCase();
  return `image/${!ext || ext === "jpg" ? "jpeg" : ext}`;
}

interface CloudinaryUploadResponse {
  secure_url?: string;
  error?: { message?: string };
}

/**
 * Upload one already-picked asset and resolve to its Cloudinary delivery URL.
 * The form fields must match the signed params exactly — folder and
 * transformation are echoed verbatim from the signature, because changing
 * either invalidates it.
 *
 * Uses expo-file-system's native multipart upload rather than fetch + FormData,
 * for two reasons:
 *
 *  1. `global.fetch` here is Expo's WinterCG fetch, which builds the multipart
 *     body itself in JS and accepts only string | Blob | File parts. React
 *     Native's file convention — a `{uri, name, type}` object — is none of
 *     those, so it throws "Unsupported FormDataPart implementation" before
 *     anything is sent ("`uri` is not supported for React Native's FormData",
 *     per expo/src/winter/fetch/convertFormData.ts).
 *  2. Even where it works, that path reads the whole file into a JS Uint8Array
 *     to assemble the body — a 10MB photo is then held in memory twice.
 *
 * uploadAsync hands the file path to native code, which streams it off disk and
 * reports a real status and body.
 */
export async function uploadImage(
  kind: UploadKind,
  asset: ImagePicker.ImagePickerAsset,
): Promise<string> {
  const sig = await api.upload.getSignature.mutate({ kind });
  const mimeType = mimeTypeOf(asset);

  if (__DEV__) {
    console.log(
      `[Upload →] ${kind} ${sig.uploadUrl}`,
      JSON.stringify({ uri: asset.uri, mimeType, fileSize: asset.fileSize }),
    );
  }

  const started = Date.now();
  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(sig.uploadUrl, asset.uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      // Every value Cloudinary verifies the signature against, echoed exactly
      // as it was signed. Any drift here reads as "Invalid Signature".
      parameters: {
        api_key: sig.apiKey,
        timestamp: String(sig.timestamp),
        folder: sig.folder,
        transformation: sig.transformation,
        signature: sig.signature,
      },
    });
  } catch (err) {
    if (__DEV__) {
      console.log(`[Upload ✕] ${kind} transport failure:`, String(err), "| uri:", asset.uri);
    }
    throw err;
  }

  let body: CloudinaryUploadResponse = {};
  try {
    body = JSON.parse(result.body) as CloudinaryUploadResponse;
  } catch {
    // Not JSON (a proxy or WAF can answer in HTML); `result.body` is logged below.
  }

  const ok = result.status >= 200 && result.status < 300 && !!body.secure_url;
  if (__DEV__) {
    console.log(
      `[Upload ${ok ? "←" : "✕"}] ${kind} ${result.status} ${Date.now() - started}ms`,
      ok ? body.secure_url : result.body.slice(0, 400),
    );
  }

  if (!ok) {
    throw new UploadFailedError(
      body.error?.message ?? `Cloudinary returned ${result.status} without a secure_url`,
      result.status,
      kind,
    );
  }
  return body.secure_url!;
}

/** Pick then upload in one call. Null means the user cancelled. */
export async function pickAndUploadImage(
  kind: UploadKind,
  source: PickSource,
  options?: PickOptions,
): Promise<string | null> {
  const asset = await pickImage(source, kind, options);
  return asset ? uploadImage(kind, asset) : null;
}

/** Pick several then upload them together. Empty means cancelled. */
export async function pickAndUploadImages(
  kind: UploadKind,
  source: PickSource,
  options?: PickOptions,
): Promise<string[]> {
  const assets = await pickImages(source, kind, options);
  return Promise.all(assets.map((a) => uploadImage(kind, a)));
}
