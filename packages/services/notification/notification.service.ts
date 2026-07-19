import { Expo } from "expo-server-sdk";
import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type NotificationType, type DeviceType } from "@repo/database";
import { logger } from "@repo/logger";

/**
 * Internal notification fan-out (not exposed via OpenAPI): creates a
 * `Notification` row per recipient AND attempts an Expo push to each of
 * their registered tokens. Deliberately never throws — a notification
 * failure must not fail the triggering operation (visitor registration,
 * ticket update, …); errors are logged instead.
 */

let expoClient: Expo | null = null;
function expo(): Expo {
  return (expoClient ??= new Expo());
}

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function notifyUsers(userIds: string[], payload: NotifyPayload): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      })),
    });

    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    const messages = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        // Carry the notification type alongside the deep-link ids so the app can
        // route a tapped push the same way the in-app inbox routes its rows
        // (the inbox reads `type` from its own column; a push has only `data`).
        data: { ...payload.data, type: payload.type },
      }));

    for (const chunk of expo().chunkPushNotifications(messages)) {
      await expo().sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    logger.error("Notification fan-out failed", { type: payload.type, err });
  }
}

export function notifyUser(userId: string, payload: NotifyPayload): Promise<void> {
  return notifyUsers([userId], payload);
}

/** Active residents of one flat. */
export async function flatResidentUserIds(flatId: string): Promise<string[]> {
  const profiles = await prisma.residentProfile.findMany({
    where: { flatId, user: { isActive: true } },
    select: { userId: true },
  });
  return profiles.map((p) => p.userId);
}

/** Active residents of a whole society. */
export async function societyResidentUserIds(societyId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { societyId, role: "RESIDENT", isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Active admins of a society. */
export async function societyAdminUserIds(societyId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { societyId, role: "ADMIN", isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Client-facing: push tokens and the notification inbox
// ---------------------------------------------------------------------------

export async function registerPushToken(
  actor: User,
  input: { token: string; deviceType: DeviceType },
): Promise<void> {
  if (!Expo.isExpoPushToken(input.token)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Not a valid Expo push token",
    });
  }
  await prisma.pushToken.upsert({
    where: { userId_token: { userId: actor.id, token: input.token } },
    create: { userId: actor.id, token: input.token, deviceType: input.deviceType },
    update: { deviceType: input.deviceType },
  });
}

/**
 * Remove a device's push token for the caller (called on sign-out so the next
 * user on a shared device doesn't inherit the previous user's pushes). Scoped
 * to (user, token); a token that isn't the caller's is silently ignored so
 * logout never fails on it.
 */
export async function unregisterPushToken(
  actor: User,
  input: { token: string },
): Promise<void> {
  await prisma.pushToken.deleteMany({
    where: { userId: actor.id, token: input.token },
  });
}

export interface NotificationInfo {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: unknown;
  isRead: boolean;
  createdAt: string;
}

function toNotificationInfo(n: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  isRead: boolean;
  createdAt: Date;
}): NotificationInfo {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(
  actor: User,
  input: { cursor?: string; limit: number; unreadOnly?: boolean },
): Promise<{ items: NotificationInfo[]; nextCursor: string | null; unreadCount: number }> {
  // `unreadCount` is deliberately counted unfiltered: it drives the bell badge,
  // which must mean the same thing whichever way the list was asked for.
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: actor.id, ...(input.unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { userId: actor.id, isRead: false } }),
  ]);

  const hasMore = notifications.length > input.limit;
  const items = (hasMore ? notifications.slice(0, input.limit) : notifications).map(
    toNotificationInfo,
  );
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, unreadCount };
}

export async function markRead(
  actor: User,
  input: { notificationId: string },
): Promise<NotificationInfo> {
  const notification = await prisma.notification.findFirst({
    where: { id: input.notificationId, userId: actor.id },
  });
  if (!notification) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
  }
  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true },
  });
  return toNotificationInfo(updated);
}

export async function markAllRead(actor: User): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId: actor.id, isRead: false },
    data: { isRead: true },
  });
  return result.count;
}
