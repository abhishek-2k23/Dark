import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User, type NotificationType } from "@repo/database";

import * as notificationService from "./notification.service";
import * as visitorService from "../visitor/visitor.service";
import * as helpdeskService from "../helpdesk/helpdesk.service";
import * as noticeService from "../notice/notice.service";
import * as pollService from "../poll/poll.service";
import * as dueService from "../dues/due.service";

/** Captures every push message "sent" through the mocked Expo SDK. */
const h = vi.hoisted(() => ({ sentPushes: [] as Array<{ to: string; title: string }> }));

vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken(token: string) {
      return token.startsWith("ExponentPushToken[");
    }
    chunkPushNotifications(messages: Array<{ to: string; title: string }>) {
      return messages.length ? [messages] : [];
    }
    async sendPushNotificationsAsync(chunk: Array<{ to: string; title: string }>) {
      h.sentPushes.push(...chunk);
      return chunk.map(() => ({ status: "ok" }));
    }
  },
}));

const runId = `nf-${Date.now().toString(36)}`;
const residentToken = `ExponentPushToken[resident-${runId}]`;
const guardToken = `ExponentPushToken[guard-${runId}]`;

let societyId: string;
let flatId: string;
let guard: User;
let resident: User;
let admin: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

/** Latest notifications of a user with the given type. */
function rowsOf(userId: string, type: NotificationType) {
  return prisma.notification.findMany({ where: { userId, type } });
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `NF Society ${runId}`,
      address: "1 NF St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `NF-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "NF-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;

  const mkUser = (name: string, role: "GUARD" | "RESIDENT" | "ADMIN", withFlat?: boolean) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId,
        ...(withFlat ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  guard = await mkUser("NF Guard", "GUARD");
  resident = await mkUser("NF Resident", "RESIDENT", true);
  admin = await mkUser("NF Admin", "ADMIN");

  await notificationService.registerPushToken(resident, {
    token: residentToken,
    deviceType: "ANDROID",
  });
  await notificationService.registerPushToken(guard, {
    token: guardToken,
    deviceType: "IOS",
  });
});

afterAll(async () => {
  await prisma.visitor.deleteMany({ where: { flat: { tower: { societyId } } } });
  await prisma.helpdeskTicket.deleteMany({ where: { flat: { tower: { societyId } } } });
  await prisma.notice.deleteMany({ where: { societyId } });
  await prisma.pollOption.deleteMany({ where: { poll: { societyId } } });
  await prisma.poll.deleteMany({ where: { societyId } });
  await prisma.maintenanceDue.deleteMany({ where: { flat: { tower: { societyId } } } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("push token registration", () => {
  it("rejects a non-Expo token", async () => {
    await expectTRPCError(
      notificationService.registerPushToken(resident, {
        token: "not-a-push-token",
        deviceType: "ANDROID",
      }),
      "BAD_REQUEST",
    );
  });

  it("re-registering the same token upserts instead of duplicating", async () => {
    await notificationService.registerPushToken(resident, {
      token: residentToken,
      deviceType: "IOS",
    });
    const tokens = await prisma.pushToken.findMany({ where: { userId: resident.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.deviceType).toBe("IOS");
  });

  it("unregister removes only the given token, and is a no-op when absent", async () => {
    const temp = "ExponentPushToken[unregister-temp-xxxxxxxxxx]";
    await notificationService.registerPushToken(resident, {
      token: temp,
      deviceType: "ANDROID",
    });
    await notificationService.unregisterPushToken(resident, { token: temp });
    expect(await prisma.pushToken.findMany({ where: { token: temp } })).toHaveLength(0);
    // The resident's real token is untouched, and a repeat unregister is harmless.
    await notificationService.unregisterPushToken(resident, { token: temp });
    expect(
      await prisma.pushToken.findMany({ where: { userId: resident.id, token: residentToken } }),
    ).toHaveLength(1);
  });
});

describe("trigger: visitor registered → flat residents", () => {
  it("creates a VISITOR_PENDING row and pushes to the resident's device", async () => {
    const visitor = await visitorService.registerVisitor(guard, {
      name: "Push Visitor",
      phone: "+919900000021",
      purpose: "GUEST",
      flatId,
    });

    const rows = await rowsOf(resident.id, "VISITOR_PENDING");
    expect(rows).toHaveLength(1);
    expect((rows[0]!.data as { visitorId: string }).visitorId).toBe(visitor.id);
    expect(h.sentPushes.filter((p) => p.to === residentToken)).toHaveLength(1);
  });
});

describe("trigger: visitor decided → registering guard", () => {
  it("creates a VISITOR_APPROVED row and pushes to the guard's device", async () => {
    const visitor = await visitorService.registerVisitor(guard, {
      name: "Decided Visitor",
      phone: "+919900000022",
      purpose: "DELIVERY",
      flatId,
    });
    await visitorService.decideVisitor(resident, {
      visitorId: visitor.id,
      decision: "APPROVED",
    });

    const rows = await rowsOf(guard.id, "VISITOR_APPROVED");
    expect(rows).toHaveLength(1);
    expect(h.sentPushes.filter((p) => p.to === guardToken)).toHaveLength(1);
  });

  it("a denial creates VISITOR_DENIED", async () => {
    const visitor = await visitorService.registerVisitor(guard, {
      name: "Denied Visitor",
      phone: "+919900000023",
      purpose: "CAB",
      flatId,
    });
    await visitorService.decideVisitor(resident, {
      visitorId: visitor.id,
      decision: "DENIED",
    });
    expect(await rowsOf(guard.id, "VISITOR_DENIED")).toHaveLength(1);
  });
});

describe("trigger: ticket status changed → raising resident", () => {
  it("creates a TICKET_STATUS_CHANGED row", async () => {
    const ticket = await helpdeskService.createTicket(resident, {
      category: "ELECTRICAL",
      title: "Push ticket",
      description: "Socket sparking",
    });
    await helpdeskService.updateTicketStatus(admin, {
      ticketId: ticket.id,
      status: "IN_PROGRESS",
    });

    const rows = await rowsOf(resident.id, "TICKET_STATUS_CHANGED");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain("in progress");
  });
});

describe("trigger: notice published → society residents", () => {
  it("an immediately-published notice notifies; a scheduled one does not (until published)", async () => {
    await noticeService.createNotice(admin, {
      title: "Push notice",
      body: "Immediate",
      category: "GENERAL",
    });
    expect(await rowsOf(resident.id, "NOTICE_PUBLISHED")).toHaveLength(1);

    const scheduled = await noticeService.createNotice(admin, {
      title: "Scheduled push notice",
      body: "Later",
      category: "EVENT",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(await rowsOf(resident.id, "NOTICE_PUBLISHED")).toHaveLength(1); // unchanged

    await noticeService.updateNotice(admin, { noticeId: scheduled.id, scheduledAt: null });
    expect(await rowsOf(resident.id, "NOTICE_PUBLISHED")).toHaveLength(2); // publish-now fired
  });
});

describe("trigger: poll created → society residents", () => {
  it("creates a POLL_CREATED row", async () => {
    await pollService.createPoll(admin, {
      question: "Push poll?",
      options: ["Yes", "No"],
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const rows = await rowsOf(resident.id, "POLL_CREATED");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe("Push poll?");
  });
});

describe("trigger: dues generated → society residents", () => {
  it("creates a DUE_GENERATED row on the creating run only", async () => {
    await dueService.generateMonthly(admin, { month: 6, year: 2031, amount: 1500 });
    expect(await rowsOf(resident.id, "DUE_GENERATED")).toHaveLength(1);

    // Idempotent rerun creates nothing, so it must not re-notify.
    await dueService.generateMonthly(admin, { month: 6, year: 2031, amount: 1500 });
    expect(await rowsOf(resident.id, "DUE_GENERATED")).toHaveLength(1);
  });
});

describe("inbox", () => {
  it("lists newest-first with an unread count", async () => {
    const inbox = await notificationService.listNotifications(resident, { limit: 50 });
    expect(inbox.items.length).toBeGreaterThanOrEqual(5);
    expect(inbox.unreadCount).toBe(inbox.items.length);
    const times = inbox.items.map((n) => n.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("markRead is scoped to the owner", async () => {
    const inbox = await notificationService.listNotifications(resident, { limit: 1 });
    const target = inbox.items[0]!;

    await expectTRPCError(
      notificationService.markRead(guard, { notificationId: target.id }),
      "NOT_FOUND",
    );

    const read = await notificationService.markRead(resident, { notificationId: target.id });
    expect(read.isRead).toBe(true);
  });

  it("unreadOnly hides read items without distorting the badge count", async () => {
    // The test above has marked exactly one notification read, so there is a
    // mix to filter — without that this would pass vacuously.
    const all = await notificationService.listNotifications(resident, { limit: 50 });
    const readOnes = all.items.filter((n) => n.isRead);
    expect(readOnes.length).toBeGreaterThan(0);

    const unread = await notificationService.listNotifications(resident, {
      limit: 50,
      unreadOnly: true,
    });
    expect(unread.items.every((n) => !n.isRead)).toBe(true);
    expect(unread.items.length).toBe(all.items.length - readOnes.length);

    // The bell badge must mean "everything unread", not "unread on this page",
    // so the count is identical whichever way the list was asked for.
    expect(unread.unreadCount).toBe(all.unreadCount);
    expect(unread.items.map((n) => n.id)).not.toContain(readOnes[0]!.id);
  });

  it("markAllRead clears the rest", async () => {
    const marked = await notificationService.markAllRead(resident);
    expect(marked).toBeGreaterThanOrEqual(4);
    const after = await notificationService.listNotifications(resident, { limit: 1 });
    expect(after.unreadCount).toBe(0);
  });
});
