import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as noticeService from "./notice.service";

const runId = `nt-${Date.now().toString(36)}`;

let societyId: string;
let admin: User;
let resident: User;
let foreignAdmin: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `NT Society ${runId}`,
      address: "1 NT St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const otherSociety = await prisma.society.create({
    data: {
      name: `NT Other ${runId}`,
      address: "2 NT St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  const tower = await prisma.tower.create({ data: { societyId, name: `NT-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "NT-101", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "RESIDENT" | "ADMIN", sid: string, flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  admin = await mkUser("NT Admin", "ADMIN", societyId);
  resident = await mkUser("NT Resident", "RESIDENT", societyId, flat.id);
  foreignAdmin = await mkUser("NT Foreign Admin", "ADMIN", otherSociety.id);
});

afterAll(async () => {
  const societies = await prisma.society.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  });
  const societyIds = societies.map((s) => s.id);
  await prisma.notice.deleteMany({ where: { societyId: { in: societyIds } } });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("scheduledAt visibility", () => {
  let scheduledId: string;

  it("rejects a past scheduledAt", async () => {
    await expectTRPCError(
      noticeService.createNotice(admin, {
        title: "Too late",
        body: "x",
        category: "GENERAL",
        scheduledAt: new Date(Date.now() - 1000).toISOString(),
      }),
      "BAD_REQUEST",
    );
  });

  it("residents see published notices but not scheduled ones; admins see both", async () => {
    await noticeService.createNotice(admin, {
      title: "Water outage",
      body: "Tomorrow 10–12",
      category: "MAINTENANCE",
      isPinned: true,
    });
    const scheduled = await noticeService.createNotice(admin, {
      title: "Diwali event",
      body: "Save the date",
      category: "EVENT",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    scheduledId = scheduled.id;
    expect(scheduled.isPublished).toBe(false);

    const residentView = await noticeService.listNotices(resident, { limit: 50 });
    expect(residentView.items.map((n) => n.title)).toContain("Water outage");
    expect(residentView.items.map((n) => n.title)).not.toContain("Diwali event");

    const adminView = await noticeService.listNotices(admin, { limit: 50 });
    expect(adminView.items.map((n) => n.title)).toContain("Diwali event");
    // Pinned notice sorts first.
    expect(adminView.items[0]!.title).toBe("Water outage");
  });

  it("publishing a scheduled notice via scheduledAt: null makes it visible", async () => {
    const published = await noticeService.updateNotice(admin, {
      noticeId: scheduledId,
      scheduledAt: null,
    });
    expect(published.isPublished).toBe(true);

    const residentView = await noticeService.listNotices(resident, { limit: 50 });
    expect(residentView.items.map((n) => n.title)).toContain("Diwali event");
  });

  it("update and delete are scoped to the admin's society", async () => {
    await expectTRPCError(
      noticeService.updateNotice(foreignAdmin, { noticeId: scheduledId, title: "Hijack" }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      noticeService.deleteNotice(foreignAdmin, { noticeId: scheduledId }),
      "NOT_FOUND",
    );
    await noticeService.deleteNotice(admin, { noticeId: scheduledId });
    const gone = await prisma.notice.findUnique({ where: { id: scheduledId } });
    expect(gone).toBeNull();
  });
});
