import crypto from "node:crypto";

/** Email-verification OTP configuration. */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
/** Wrong-code tries allowed before an OTP is burned and a resend is required. */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically-random numeric OTP, zero-padded to OTP_LENGTH.
 * `randomInt` is uniform (no modulo bias) over the requested range.
 */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH; // exclusive upper bound
  return crypto.randomInt(0, max).toString().padStart(OTP_LENGTH, "0");
}

/** SHA-256 of the code — only the hash is ever persisted. */
export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Constant-time comparison of a candidate code against a stored hash. */
export function verifyOtp(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

/** Expiry timestamp for a freshly-issued OTP. */
export function otpExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + OTP_TTL_SECONDS * 1000);
}
