import type { BadgeTone } from "@/components/ui";
import type { IconColor, IconName } from "@/components/ui";
import type { Role } from "@/stores/authStore";

/**
 * Domain enum → presentation maps shared across the resident screens.
 * Labels live in i18n under `enums.*`; these maps cover tone + iconography.
 */

export const visitorStatusTone: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  DENIED: "danger",
  EXPIRED: "neutral",
};

export const preApprovalStatusTone: Record<string, BadgeTone> = {
  ACTIVE: "mint",
  USED: "primary",
  EXPIRED: "neutral",
  CANCELLED: "danger",
};

export const ticketStatusTone: Record<string, BadgeTone> = {
  OPEN: "warning",
  IN_PROGRESS: "primary",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export const dueStatusTone: Record<string, BadgeTone> = {
  PENDING: "warning",
  PAID: "success",
  OVERDUE: "danger",
};

export const paymentStatusTone: Record<string, BadgeTone> = {
  INITIATED: "warning",
  PENDING_VERIFICATION: "warning",
  SUCCESS: "success",
  FAILED: "danger",
  REJECTED: "danger",
};

export const bookingStatusTone: Record<string, BadgeTone> = {
  BOOKED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
};

export const visitorPurposeIcon: Record<string, IconName> = {
  GUEST: "people-outline",
  DELIVERY: "cube-outline",
  CAB: "car-outline",
  SERVICE_STAFF: "construct-outline",
  OTHER: "help-circle-outline",
};

export const ticketCategoryIcon: Record<string, IconName> = {
  PLUMBING: "water-outline",
  ELECTRICAL: "flash-outline",
  HOUSEKEEPING: "sparkles-outline",
  SECURITY: "shield-checkmark-outline",
  OTHER: "build-outline",
};

export const noticeCategoryIcon: Record<string, IconName> = {
  MAINTENANCE: "construct-outline",
  EVENT: "calendar-outline",
  EMERGENCY: "warning-outline",
  GENERAL: "megaphone-outline",
};

/** Solid card background class per notice category (dashboard carousel). */
export const noticeCategoryCard: Record<string, string> = {
  MAINTENANCE: "bg-primary-strong",
  EVENT: "bg-success",
  EMERGENCY: "bg-danger",
  GENERAL: "bg-primary",
};

/**
 * Accent token per notice category (glass carousel cards). `EMERGENCY` keeps
 * the semantic danger red — an urgent notice has to look urgent — while the
 * rest split across the two decorative hues.
 */
export const noticeCategoryAccent: Record<string, IconColor> = {
  MAINTENANCE: "neonBlue",
  EVENT: "neonViolet",
  EMERGENCY: "danger",
  GENERAL: "neonBlue",
};

export const serviceCategoryIcon: Record<string, IconName> = {
  MAID: "home-outline",
  ELECTRICIAN: "flash-outline",
  PLUMBER: "water-outline",
  DRIVER: "car-outline",
  OTHER: "briefcase-outline",
};

export const notificationTypeIcon: Record<string, IconName> = {
  JOIN_REQUEST_RECEIVED: "person-add-outline",
  JOIN_REQUEST_APPROVED: "checkmark-done-outline",
  JOIN_REQUEST_REJECTED: "close-circle-outline",
  VISITOR_PENDING: "walk-outline",
  VISITOR_APPROVED: "checkmark-circle-outline",
  VISITOR_DENIED: "close-circle-outline",
  TICKET_STATUS_CHANGED: "construct-outline",
  TICKET_COMMENT: "chatbubble-outline",
  NOTICE_PUBLISHED: "megaphone-outline",
  POLL_CREATED: "stats-chart-outline",
  DUE_GENERATED: "wallet-outline",
  PAYMENT_VERIFIED: "checkmark-done-outline",
  PAYMENT_REJECTED: "alert-circle-outline",
  BOOKING_CONFIRMED: "calendar-outline",
  GENERAL: "notifications-outline",
};

/**
 * Best-effort deep link for a notification, given the recipient's role. Used by
 * both the in-app inbox (tap a card) and the OS push-tap handler, so a push and
 * its inbox row always route to the same place. Returns null when there's no
 * meaningful destination (the notification still shows; it just isn't tappable).
 *
 * The `data` payload is written by the server triggers (e.g. `{ visitorId }`);
 * routes are role-specific because each role lives in its own expo-router group.
 */
export function notificationHref(
  role: Role,
  type: string,
  data: unknown,
): string | null {
  const d = (data ?? {}) as Record<string, string>;

  if (role === "RESIDENT") {
    if (d.visitorId) return `/(resident)/visitors/${d.visitorId}`;
    if (d.ticketId) return `/(resident)/tickets/${d.ticketId}`;
    if (d.noticeId) return `/(resident)/notices/${d.noticeId}`;
    if (d.pollId) return `/(resident)/polls/${d.pollId}`;
    if (
      type === "DUE_GENERATED" ||
      type === "PAYMENT_VERIFIED" ||
      type === "PAYMENT_REJECTED"
    ) {
      return "/(resident)/(tabs)/payments";
    }
    if (type.startsWith("JOIN_REQUEST")) return "/";
    return null;
  }

  if (role === "ADMIN") {
    if (d.ticketId) return `/(admin)/tickets/${d.ticketId}`;
    if (d.pollId) return `/(admin)/polls/${d.pollId}`;
    if (d.noticeId) return "/(admin)/notices";
    if (d.visitorId) return "/(admin)/reports";
    if (type === "DUE_GENERATED") return "/(admin)/reports";
    if (type === "PAYMENT_VERIFIED" || type === "PAYMENT_REJECTED") {
      return "/(admin)/payments/verify";
    }
    if (type === "JOIN_REQUEST_RECEIVED") return "/(admin)/join-requests";
    return null;
  }

  // GUARD — the only pushes guards receive today are visitor decisions.
  if (d.visitorId) return `/(guard)/visitors/${d.visitorId}`;
  return null;
}

/** Minutes a PENDING visitor request stays actionable (mirrors server TTL). */
export const VISITOR_PENDING_TTL_MIN = 15;
