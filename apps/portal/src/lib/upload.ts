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
 * Cloudinary stores the extension from the filename we send, and its own
 * `resource_type: image` check keys off the mime type — so a wrong guess here
 * produces a file that 404s on delivery. Fall back to jpeg, which is what
 * every camera on both platforms actually produces.
 */
function fileNameAndType(asset: ImagePicker.ImagePickerAsset): {
  name: string;
  type: string;
} {
  const fromMime = asset.mimeType?.split("/")[1];
  const fromName = asset.fileName?.split(".").pop()?.toLowerCase();
  const ext = fromMime ?? fromName ?? "jpg";
  return {
    name: asset.fileName ?? `upload.${ext}`,
    type: asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
  };
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
 */
export async function uploadImage(
  kind: UploadKind,
  asset: ImagePicker.ImagePickerAsset,
): Promise<string> {
  const sig = await api.upload.getSignature.mutate({ kind });

  const { name, type } = fileNameAndType(asset);
  const form = new FormData();
  // RN's FormData takes this {uri,name,type} shape for files; the cast is the
  // long-standing RN/DOM typing mismatch, not a real Blob.
  form.append("file", { uri: asset.uri, name, type } as unknown as Blob);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("transformation", sig.transformation);
  form.append("signature", sig.signature);

  const started = Date.now();
  const res = await fetch(sig.uploadUrl, { method: "POST", body: form });

  // Read as text first: a failing Cloudinary request does not always answer in
  // JSON (a proxy or a WAF can return HTML), and res.json() would then throw
  // and bury the only description of what went wrong.
  const raw = await res.text();
  let body: CloudinaryUploadResponse = {};
  try {
    body = JSON.parse(raw) as CloudinaryUploadResponse;
  } catch {
    // Leave body empty; `raw` is logged below.
  }

  const ok = res.ok && !!body.secure_url;
  if (__DEV__) {
    console.log(
      `[Upload ${ok ? "←" : "✕"}] ${kind} ${res.status} ${Date.now() - started}ms`,
      ok ? body.secure_url : raw.slice(0, 400),
    );
  }

  if (!ok) {
    throw new UploadFailedError(
      body.error?.message ?? `Cloudinary returned ${res.status} without a secure_url`,
      res.status,
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
