import { v2 as cloudinary } from "cloudinary";
import { TRPCError } from "@trpc/server";

/**
 * Cloudinary signed direct uploads. The mobile app never sees the API
 * secret: it asks the backend for a signature (upload.getSignature), then
 * POSTs the file straight to Cloudinary with that signature. The returned
 * secure_url is sent back to whichever mutation stores it, where
 * assertCloudinaryUrl re-checks the domain.
 *
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 */

export type UploadKind = "AVATAR" | "VISITOR" | "TICKET" | "NOTICE";

/** Folder + incoming transformation per upload kind (see plan Phase 9). */
export const UPLOAD_PRESETS: Record<UploadKind, { folder: string; transformation: string }> = {
  AVATAR: { folder: "avatars", transformation: "c_thumb,g_face,w_512,h_512" }, // square, face-crop
  VISITOR: { folder: "visitors", transformation: "c_fill,w_800,h_600,q_auto:good" }, // fixed aspect, moderate compression
  TICKET: { folder: "tickets", transformation: "c_limit,w_1600,h_1600,q_auto:good" }, // original, size-capped
  NOTICE: { folder: "notices", transformation: "c_fill,w_1200,h_400" }, // banner aspect
};

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function config(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Media uploads are not configured on this server",
    });
  }
  return { cloudName, apiKey, apiSecret };
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  /** Unix seconds; Cloudinary rejects signatures older than 1 hour. */
  timestamp: number;
  folder: string;
  transformation: string;
  signature: string;
  /** POST the multipart upload here. */
  uploadUrl: string;
}

/**
 * Server-side signature for a direct client upload of the given kind. The
 * client must include exactly `timestamp`, `folder`, and `transformation`
 * (plus `api_key`, `signature`, and the file) in its upload form.
 */
export function getUploadSignature(kind: UploadKind): UploadSignature {
  const { cloudName, apiKey, apiSecret } = config();
  const preset = UPLOAD_PRESETS[kind];
  const timestamp = Math.floor(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: preset.folder, transformation: preset.transformation },
    apiSecret,
  );

  return {
    cloudName,
    apiKey,
    timestamp,
    folder: preset.folder,
    transformation: preset.transformation,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}

/**
 * True when the URL is an https Cloudinary delivery URL for the configured
 * cloud. When Cloudinary is not configured (local dev), every URL passes —
 * there is no cloud name to check against.
 */
export function isAllowedMediaUrl(url: string): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      parsed.pathname.startsWith(`/${cloudName}/`)
    );
  } catch {
    return false;
  }
}

/**
 * Guards every mutation that stores a client-supplied media URL. Accepts
 * undefined so callers can pass optional inputs straight through.
 */
export function assertCloudinaryUrl(url: string | undefined | null): void {
  if (url === undefined || url === null) return;
  if (!isAllowedMediaUrl(url)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Media URLs must come from this app's Cloudinary cloud — upload via the signed flow first",
    });
  }
}

export function assertCloudinaryUrls(urls: string[] | undefined | null): void {
  for (const url of urls ?? []) assertCloudinaryUrl(url);
}
