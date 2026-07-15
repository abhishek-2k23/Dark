import type { BadgeTone } from "@/components/ui";
import type { IconColor, IconName } from "@/components/ui";

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
  SUCCESS: "success",
  FAILED: "danger",
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
  VISITOR_PENDING: "walk-outline",
  VISITOR_APPROVED: "checkmark-circle-outline",
  VISITOR_DENIED: "close-circle-outline",
  TICKET_STATUS_CHANGED: "construct-outline",
  TICKET_COMMENT: "chatbubble-outline",
  NOTICE_PUBLISHED: "megaphone-outline",
  POLL_CREATED: "stats-chart-outline",
  DUE_GENERATED: "wallet-outline",
  BOOKING_CONFIRMED: "calendar-outline",
  GENERAL: "notifications-outline",
};

/** Minutes a PENDING visitor request stays actionable (mirrors server TTL). */
export const VISITOR_PENDING_TTL_MIN = 15;
