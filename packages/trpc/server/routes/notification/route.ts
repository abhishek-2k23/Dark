import { notificationService } from "@repo/services";

import { z } from "../../schema";
import { protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const notificationPath = generatePath("v1/notifications");
const pushTokenPath = generatePath("v1/push-tokens");

const NotificationTypeEnum = z
  .enum([
    "JOIN_REQUEST_RECEIVED",
    "JOIN_REQUEST_APPROVED",
    "JOIN_REQUEST_REJECTED",
    "VISITOR_PENDING",
    "VISITOR_APPROVED",
    "VISITOR_DENIED",
    "VISITOR_ARRIVED",
    "PAYMENT_SUBMITTED",
    "BOOKING_CANCELLED",
    "TICKET_RAISED",
    "TICKET_STATUS_CHANGED",
    "TICKET_COMMENT",
    "TICKET_ASSIGNED",
    "NOTICE_PUBLISHED",
    "POLL_CREATED",
    "DUE_GENERATED",
    "PAYMENT_VERIFIED",
    "PAYMENT_REJECTED",
    "BOOKING_CONFIRMED",
    "SERVICE_BILL_RAISED",
    "SERVICE_PAYMENT_REVERSED",
    "BOOKING_PAYMENT_EXPIRED",
    "PAYOUT_ACTIVATED",
    "PAYOUT_TRANSFER_FAILED",
    "SUBSCRIPTION_ACTIVATED",
    "SUBSCRIPTION_EXPIRING",
    "SUBSCRIPTION_EXPIRED",
    "GENERAL",
  ])
  .describe("What event produced this notification");

const NotificationModel = z
  .object({
    id: z.string().describe("Notification id"),
    type: NotificationTypeEnum,
    title: z.string().describe("Notification title"),
    body: z.string().describe("Notification body"),
    data: z
      .any()
      .describe("Deep-link payload (e.g. { visitorId }) matching the type; null if none"),
    isRead: z.boolean().describe("Whether the user has read it"),
    createdAt: z.string().describe("ISO creation time"),
  })
  .describe("An in-app notification");

const RegisterPushTokenInput = z.object({
  token: z
    .string()
    .min(1)
    .describe("Expo push token from Notifications.getExpoPushTokenAsync()"),
  deviceType: z.enum(["IOS", "ANDROID"]).describe("Device platform"),
});

const UnregisterPushTokenInput = z.object({
  token: z.string().min(1).describe("The Expo push token to remove"),
});

const ListNotificationsInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last notification from the previous page").optional(),
});

const NotificationIdInput = z.object({
  notificationId: z.string().describe("Id of the notification"),
});

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

export const pushTokenRouter = router({
  register: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: pushTokenPath("register"),
        tags: ["Notifications"],
        summary: "Register a device's Expo push token",
        description:
          "Called by the mobile app after push permission is granted; upserts by " +
          "(user, token) so re-registering the same device is safe. Errors: 400 if the " +
          "token is not a valid Expo push token, 401 if not authenticated.",
        protect: true,
      },
    })
    .input(RegisterPushTokenInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await notificationService.registerPushToken(ctx.user, input);
      return { success: true as const };
    }),

  unregister: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: pushTokenPath("unregister"),
        tags: ["Notifications"],
        summary: "Remove a device's Expo push token",
        description:
          "Called by the mobile app on sign-out so the next user on a shared device " +
          "doesn't inherit the previous user's pushes. Idempotent — removing a token " +
          "that isn't registered (or isn't the caller's) succeeds. Errors: 401 if not " +
          "authenticated.",
        protect: true,
      },
    })
    .input(UnregisterPushTokenInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await notificationService.unregisterPushToken(ctx.user, input);
      return { success: true as const };
    }),
});

export const notificationRouter = router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: notificationPath(""),
        tags: ["Notifications"],
        summary: "List the caller's notifications",
        description:
          "Cursor-paginated notifications, newest first (clients group by day), plus the " +
          "caller's total unread count for badges. Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(ListNotificationsInput)
    .output(
      z.object({
        items: z.array(NotificationModel).describe("Notifications on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
        unreadCount: z.number().describe("Caller's total unread notifications (for badges)"),
      }),
    )
    .query(({ ctx, input }) => notificationService.listNotifications(ctx.user, input)),

  markRead: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: notificationPath("{notificationId}/read"),
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        description:
          "Errors: 401 if not authenticated, 404 if the notification does not belong to " +
          "the caller.",
        protect: true,
      },
    })
    .input(NotificationIdInput)
    .output(NotificationModel)
    .mutation(({ ctx, input }) => notificationService.markRead(ctx.user, input)),

  markAllRead: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: notificationPath("read-all"),
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        description:
          "Marks every unread notification for the calling user as read in one call and returns " +
          "how many rows were updated (drives clearing the unread badge). Idempotent — a second " +
          "call marks 0. Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(z.object({}).describe("No fields"))
    .output(
      SuccessModel.extend({
        marked: z.number().describe("How many notifications were marked read"),
      }),
    )
    .mutation(async ({ ctx }) => {
      const marked = await notificationService.markAllRead(ctx.user);
      return { success: true as const, marked };
    }),
});
