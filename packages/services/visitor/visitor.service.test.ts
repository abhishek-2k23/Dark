import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as visitorService from "./visitor.service";

const runId = `vis-${Date.now().toString(36)}`;

let societyId: string;
let otherSocietyId: string;
let flatId: string;
let otherFlatInSocietyId: string;
let guard: User;
let otherGuard: User;
let resident: User;
let otherResident: User;
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

function registerInput(overrides: Partial<Parameters<typeof visitorService.registerVisitor>[1]> = {}) {
  return {
    name: "Test Visitor",
    phone: "+919900000001",
    purpose: "DELIVERY" as const,
    flatId,
    ...overrides,
  };
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `Vis Society ${runId}`,
      address: "1 Vis St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const otherSociety = await prisma.society.create({
    data: {
      name: `Vis Other ${runId}`,
      address: "2 Vis St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  otherSocietyId = otherSociety.id;

  const tower = await prisma.tower.create({ data: { societyId, name: `VT-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "V-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;
  const flat2 = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "V-102", floor: 1, type: "TWO_BHK" },
  });
  otherFlatInSocietyId = flat2.id;

  const mkUser = (name: string, role: "GUARD" | "RESIDENT" | "ADMIN", sid: string, flat?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flat ? { residentProfile: { create: { flatId: flat } } } : {}),
      },
    });

  guard = await mkUser("Vis Guard", "GUARD", societyId);
  otherGuard = await mkUser("Vis Other Guard", "GUARD", otherSocietyId);
  resident = await mkUser("Vis Resident", "RESIDENT", societyId, flatId);
  otherResident = await mkUser("Vis Other Resident", "RESIDENT", societyId, otherFlatInSocietyId);
  admin = await mkUser("Vis Admin", "ADMIN", societyId);
});

afterAll(async () => {
  const societyIds = [societyId, otherSocietyId];
  await prisma.visitor.deleteMany({ where: { flat: { tower: { societyId: { in: societyIds } } } } });
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

describe("full lifecycle: register → approve → entry → exit", () => {
  let visitorId: string;

  it("guard registers a PENDING visitor", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    visitorId = visitor.id;
    expect(visitor.status).toBe("PENDING");
    expect(visitor.registeredByGuard.id).toBe(guard.id);
    expect(visitor.actionedByResident).toBeNull();
  });

  it("shows up in the resident's pending queue (but not a neighbour's)", async () => {
    const mine = await visitorService.listPending(resident);
    expect(mine.map((v) => v.id)).toContain(visitorId);

    const neighbours = await visitorService.listPending(otherResident);
    expect(neighbours.map((v) => v.id)).not.toContain(visitorId);
  });

  it("entry before approval is rejected", async () => {
    await expectTRPCError(visitorService.markEntry(guard, { visitorId }), "CONFLICT");
  });

  it("resident approves", async () => {
    const approved = await visitorService.decideVisitor(resident, {
      visitorId,
      decision: "APPROVED",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.actionedByResident?.id).toBe(resident.id);
  });

  it("re-deciding an already-approved request is rejected", async () => {
    await expectTRPCError(
      visitorService.decideVisitor(resident, { visitorId, decision: "DENIED" }),
      "CONFLICT",
    );
  });

  it("guard marks entry, exactly once", async () => {
    const entered = await visitorService.markEntry(guard, { visitorId });
    expect(entered.entryTime).not.toBeNull();
    await expectTRPCError(visitorService.markEntry(guard, { visitorId }), "CONFLICT");
  });

  it("guard marks exit, exactly once", async () => {
    const exited = await visitorService.markExit(guard, { visitorId });
    expect(exited.exitTime).not.toBeNull();
    await expectTRPCError(visitorService.markExit(guard, { visitorId }), "CONFLICT");
  });
});

describe("deny path", () => {
  it("denied visitors cannot enter", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    const denied = await visitorService.decideVisitor(resident, {
      visitorId: visitor.id,
      decision: "DENIED",
    });
    expect(denied.status).toBe("DENIED");
    await expectTRPCError(visitorService.markEntry(guard, { visitorId: visitor.id }), "CONFLICT");
  });

  it("exit without entry is rejected", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    await expectTRPCError(visitorService.markExit(guard, { visitorId: visitor.id }), "CONFLICT");
  });
});

describe("expiry path", () => {
  it("stale PENDING requests are flipped to EXPIRED and can no longer be actioned", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    // Backdate past the TTL.
    await prisma.visitor.update({
      where: { id: visitor.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });

    const expired = await visitorService.expireStalePendingVisitors(15);
    expect(expired).toBeGreaterThanOrEqual(1);

    const row = await prisma.visitor.findUnique({ where: { id: visitor.id } });
    expect(row?.status).toBe("EXPIRED");

    await expectTRPCError(
      visitorService.decideVisitor(resident, { visitorId: visitor.id, decision: "APPROVED" }),
      "CONFLICT",
    );
  });

  it("fresh PENDING requests are untouched", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    await visitorService.expireStalePendingVisitors(15);
    const row = await prisma.visitor.findUnique({ where: { id: visitor.id } });
    expect(row?.status).toBe("PENDING");
  });
});

describe("scoping", () => {
  it("a guard cannot register a visitor for another society's flat", async () => {
    await expectTRPCError(
      visitorService.registerVisitor(otherGuard, registerInput()),
      "NOT_FOUND",
    );
  });

  it("a resident cannot decide another flat's visitor", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    await expectTRPCError(
      visitorService.decideVisitor(otherResident, {
        visitorId: visitor.id,
        decision: "APPROVED",
      }),
      "NOT_FOUND",
    );
  });

  it("a guard from another society cannot mark entry", async () => {
    const visitor = await visitorService.registerVisitor(guard, registerInput());
    await visitorService.decideVisitor(resident, {
      visitorId: visitor.id,
      decision: "APPROVED",
    });
    await expectTRPCError(
      visitorService.markEntry(otherGuard, { visitorId: visitor.id }),
      "NOT_FOUND",
    );
  });
});

describe("history", () => {
  it("residents see their own flat only; guards and admins see the society", async () => {
    const forResident = await visitorService.history(resident, { period: "ALL", limit: 100 });
    expect(forResident.items.every((v) => v.flatId === flatId)).toBe(true);
    expect(forResident.items.length).toBeGreaterThanOrEqual(1);

    // Resident-passed flatId filters are ignored — still their own flat.
    const sneaky = await visitorService.history(resident, {
      period: "ALL",
      flatId: otherFlatInSocietyId,
      limit: 100,
    } as never);
    expect(sneaky.items.every((v) => v.flatId === flatId)).toBe(true);

    const forGuard = await visitorService.history(guard, { period: "ALL", limit: 100 });
    const forAdmin = await visitorService.history(admin, { period: "ALL", limit: 100 });
    expect(forGuard.items.length).toBe(forAdmin.items.length);
    expect(forAdmin.items.length).toBeGreaterThanOrEqual(forResident.items.length);

    // Other-society guard sees none of this society's traffic.
    const forOtherGuard = await visitorService.history(otherGuard, { period: "ALL", limit: 100 });
    expect(forOtherGuard.items).toHaveLength(0);
  });

  it("filters by status and paginates", async () => {
    const denied = await visitorService.history(admin, {
      period: "ALL",
      status: "DENIED",
      limit: 100,
    });
    expect(denied.items.every((v) => v.status === "DENIED")).toBe(true);
    expect(denied.items.length).toBeGreaterThanOrEqual(1);

    const page1 = await visitorService.history(admin, { period: "ALL", limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await visitorService.history(admin, {
      period: "ALL",
      limit: 100,
      cursor: page1.nextCursor!,
    });
    const ids = new Set([...page1.items, ...page2.items].map((v) => v.id));
    expect(ids.size).toBe(page1.items.length + page2.items.length);
  });

  it("period TODAY includes today's requests", async () => {
    const today = await visitorService.history(admin, { period: "TODAY", limit: 100 });
    expect(today.items.length).toBeGreaterThanOrEqual(1);
  });
});
