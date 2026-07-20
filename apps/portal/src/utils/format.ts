/** Date/time/currency formatting helpers (Hermes ships full Intl on SDK 56). */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso));
}

export function formatShortDate(iso: string | Date): string {
  return shortDateFmt.format(new Date(iso));
}

export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | Date): string {
  const d = new Date(iso);
  return `${shortDateFmt.format(d)}, ${timeFmt.format(d)}`;
}

const relativeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * "5 minutes ago", "yesterday" — for feeds where recency matters more than the
 * exact timestamp. Falls back to an absolute date past a week, since "7 weeks
 * ago" is harder to place than the date itself.
 *
 * Locale comes from the system, like the other formatters here, so it follows
 * the device rather than the app's i18n language.
 */
export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const deltaSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(deltaSec);

  if (abs < 60) return relativeFmt.format(Math.round(deltaSec), "second");
  if (abs < 3_600) return relativeFmt.format(Math.round(deltaSec / 60), "minute");
  if (abs < 86_400) return relativeFmt.format(Math.round(deltaSec / 3_600), "hour");
  if (abs < 7 * 86_400) return relativeFmt.format(Math.round(deltaSec / 86_400), "day");
  return formatDateTime(iso);
}

/** "14:00" → localized clock time on an arbitrary day. */
export function formatClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return timeFmt.format(d);
}

export function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

/** Local date as 'YYYY-MM-DD' (for amenity booking inputs). */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** mm:ss countdown between now and a deadline; null once passed. */
export function countdown(to: Date, now: Date = new Date()): string | null {
  const ms = to.getTime() - now.getTime();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
