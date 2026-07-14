import type { TFunction } from "i18next";

/**
 * Turn any thrown error (tRPC, react-query, or a raw network failure) into a
 * clean, user-facing message. Transport/network failures and 5xx server faults
 * collapse to friendly generic copy; curated 4xx messages from our own API
 * (e.g. "Invalid credentials", "Amenity not found") pass through unchanged.
 *
 * Pass the `t` from `useTranslation()` so the fallbacks stay localized.
 */
export function toErrorMessage(err: unknown, t: TFunction): string {
  const e = err as
    | { message?: string; data?: { httpStatus?: number } | null }
    | null
    | undefined;

  const status = e?.data?.httpStatus;

  if (status != null) {
    if (status >= 500) return t("errors.server");
    // 4xx — our backend returns human-readable, user-safe messages here.
    if (e?.message) return e.message;
    return t("errors.generic");
  }

  // No HTTP status attached → the request never got a structured response
  // (server unreachable, timeout, CORS, DNS, dropped connection, JSON parse).
  return t("errors.network");
}
