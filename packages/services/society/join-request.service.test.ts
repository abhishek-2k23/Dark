import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as joinRequestService from "./join-request.service";

const runId = `jr-${Date.now().toString(36)}`;

let societyId: string;
let flatId: string;
let admin: User;
let seekerA: User; // society-less
let seekerB: User; // society-less
let outsiderAdmin: User; // admin of a different society

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

/** Rewind a request's clocks so expiry/cooldown paths run without waiting. */
async function backdate(requestId: string, opts: { createdHoursAgo: number; expired: boolean }) {
  const createdAt = new Date(Date.now() - opts.createdHoursAgo * 3_600_000);
  await prisma.societyJoinRequest.update({
    where: { id: requestId },
    data: {
      createdAt,
      expiresAt: opts.expired
        ? new Date(Date.now() - 60_000)
        : new Date(Date.now() + 60 * 60_000),
    },
  });
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `JR Society ${runId}`,
      address: "1 JR St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `JR-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "JR-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;

  const other = await prisma.society.create({
    data: {
      name: `JR Other ${runId}`,
      address: "2 JR St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });

  admin = await prisma.user.create({
    data: {
      name: "JR Admin",
      email: `jr-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });
  outsiderAdmin = await prisma.user.create({
    data: {
      name: "JR Outsider Admin",
      email: `jr-outsider-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId: other.id,
    },
  });
  seekerA = await prisma.user.create({
    data: {
      name: "JR Seeker A",
      email: `jr-seeker-a-${runId}@test.local`,
      passwordHash: "unused",
      role: "RESIDENT",
    },
  });
  seekerB = await prisma.user.create({
    data: {
      name: "JR Seeker B",
      email: `jr-seeker-b-${runId}@test.local`,
      passwordHash: "unused",
      role: "RESIDENT",
    },
  });
});

afterAll(async () => {
  await prisma.societyJoinRequest.deleteMany({
    where: { user: { name: { startsWith: "JR Seeker" } } },
  });
  const users = await prisma.user.findMany({
    where: { name: { startsWith: "JR " } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { society: { name: { startsWith: "JR " } } } } });
  await prisma.tower.deleteMany({ where: { society: { name: { startsWith: "JR " } } } });
  await prisma.society.deleteMany({ where: { name: { startsWith: "JR " } } });
  await prisma.$disconnect();
});

describe("submitting", () => {
  it("reports success for an unknown email without creating anything", async () => {
    const res = await joinRequestService.submitJoinRequest(seekerA, {
      adminEmail: `nobody-${runId}@test.local`,
    });
    expect(res).toEqual({ submitted: true });
    const count = await prisma.societyJoinRequest.count({ where: { userId: seekerA.id } });
    expect(count).toBe(0);
  });

  it("creates a request from the admin's email (case-insensitive) and notifies admins", async () => {
    const res = await joinRequestService.submitJoinRequest(seekerA, {
      adminEmail: admin.email!.toUpperCase(),
    });
    expect(res).toEqual({ submitted: true });

    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerA.id },
    });
    expect(row?.societyId).toBe(societyId);
    expect(row?.status).toBe("PENDING");
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const note = await prisma.notification.findFirst({
      where: { userId: admin.id, type: "JOIN_REQUEST_RECEIVED" },
    });
    expect(note?.body).toContain("JR Seeker A");
  });

  it("blocks a second request while one is pending", async () => {
    await expectTRPCError(
      joinRequestService.submitJoinRequest(seekerA, { adminEmail: admin.email! }),
      "CONFLICT",
    );
  });

  it("members of a society cannot request at all", async () => {
    await expectTRPCError(
      joinRequestService.submitJoinRequest(admin, { adminEmail: admin.email! }),
      "PRECONDITION_FAILED",
    );
  });

  it("mine reflects the live request", async () => {
    const mine = await joinRequestService.myJoinRequest(seekerA);
    expect(mine?.status).toBe("PENDING");
    expect(mine?.societyName).toBe(`JR Society ${runId}`);
    expect(mine?.canRequestAgainAt).toBeNull();
  });
});

describe("expiry and cooldown", () => {
  it("the sweep flips lapsed requests to EXPIRED and mine shows the retry time", async () => {
    const row = await prisma.societyJoinRequest.findFirst({ where: { userId: seekerA.id } });
    // Asked 2h ago, TTL passed, still inside the 24h cooldown.
    await backdate(row!.id, { createdHoursAgo: 2, expired: true });

    const flipped = await joinRequestService.expireStaleJoinRequests();
    expect(flipped).toBeGreaterThanOrEqual(1);

    const mine = await joinRequestService.myJoinRequest(seekerA);
    expect(mine?.status).toBe("EXPIRED");
    expect(mine?.canRequestAgainAt).not.toBeNull();
    expect(new Date(mine!.canRequestAgainAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("re-requesting during the cooldown is refused", async () => {
    await expectTRPCError(
      joinRequestService.submitJoinRequest(seekerA, { adminEmail: admin.email! }),
      "TOO_MANY_REQUESTS",
    );
  });

  it("re-requesting after the cooldown works (measured from createdAt)", async () => {
    const row = await prisma.societyJoinRequest.findFirst({ where: { userId: seekerA.id } });
    await backdate(row!.id, { createdHoursAgo: 25, expired: true });

    const res = await joinRequestService.submitJoinRequest(seekerA, {
      adminEmail: admin.email!,
    });
    expect(res).toEqual({ submitted: true });
    const count = await prisma.societyJoinRequest.count({ where: { userId: seekerA.id } });
    expect(count).toBe(2);
  });
});

describe("the admin queue and decisions", () => {
  it("lists live requests for the admin's society only", async () => {
    const queue = await joinRequestService.listJoinRequests(admin, { limit: 20 });
    const names = queue.items.map((i) => i.userName);
    expect(names).toContain("JR Seeker A");

    const foreign = await joinRequestService.listJoinRequests(outsiderAdmin, { limit: 20 });
    expect(foreign.items).toHaveLength(0);
  });

  it("an admin of another society cannot decide on the request", async () => {
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerA.id, status: "PENDING" },
    });
    await expectTRPCError(
      joinRequestService.decideJoinRequest(outsiderAdmin, {
        requestId: row!.id,
        approve: true,
        flatId,
      }),
      "NOT_FOUND",
    );
  });

  it("approving without a flat is refused", async () => {
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerA.id, status: "PENDING" },
    });
    await expectTRPCError(
      joinRequestService.decideJoinRequest(admin, { requestId: row!.id, approve: true }),
      "BAD_REQUEST",
    );
  });

  it("approving attaches the society, creates the resident profile, and notifies", async () => {
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerA.id, status: "PENDING" },
    });
    const res = await joinRequestService.decideJoinRequest(admin, {
      requestId: row!.id,
      approve: true,
      flatId,
    });
    expect(res.status).toBe("APPROVED");

    const user = await prisma.user.findUnique({
      where: { id: seekerA.id },
      include: { residentProfile: true },
    });
    expect(user?.societyId).toBe(societyId);
    expect(user?.residentProfile?.flatId).toBe(flatId);

    const note = await prisma.notification.findFirst({
      where: { userId: seekerA.id, type: "JOIN_REQUEST_APPROVED" },
    });
    expect(note).not.toBeNull();
  });

  it("deciding the same request twice conflicts", async () => {
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerA.id, status: "APPROVED" },
    });
    await expectTRPCError(
      joinRequestService.decideJoinRequest(admin, {
        requestId: row!.id,
        approve: false,
      }),
      "CONFLICT",
    );
  });

  it("rejection is permanent for that society", async () => {
    await joinRequestService.submitJoinRequest(seekerB, { adminEmail: admin.email! });
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerB.id, status: "PENDING" },
    });

    const res = await joinRequestService.decideJoinRequest(admin, {
      requestId: row!.id,
      approve: false,
    });
    expect(res.status).toBe("REJECTED");

    const note = await prisma.notification.findFirst({
      where: { userId: seekerB.id, type: "JOIN_REQUEST_REJECTED" },
    });
    expect(note).not.toBeNull();

    // No cooldown escape hatch: rejected means an invite is the only way in.
    await expectTRPCError(
      joinRequestService.submitJoinRequest(seekerB, { adminEmail: admin.email! }),
      "FORBIDDEN",
    );
  });

  it("a lapsed request cannot be approved — it flips to EXPIRED instead", async () => {
    // seekerB is rejected by the main society; use the outsider's society.
    await joinRequestService.submitJoinRequest(seekerB, {
      adminEmail: outsiderAdmin.email!,
    });
    const row = await prisma.societyJoinRequest.findFirst({
      where: { userId: seekerB.id, status: "PENDING" },
    });
    await backdate(row!.id, { createdHoursAgo: 3, expired: true });

    await expectTRPCError(
      joinRequestService.decideJoinRequest(outsiderAdmin, {
        requestId: row!.id,
        approve: false,
      }),
      "CONFLICT",
    );
    const after = await prisma.societyJoinRequest.findUnique({ where: { id: row!.id } });
    expect(after?.status).toBe("EXPIRED");
  });
});
