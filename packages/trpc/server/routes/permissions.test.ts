import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User, type Role } from "@repo/database";

import { serverRouter } from "../index";
import { tRPCContext } from "../trpc";

/**
 * Role-gating checks at the router level: every admin-only procedure must
 * reject non-admin callers, and resident-only procedures must reject staff.
 * The middleware rejects before any service/DB code runs, so these tests
 * need no database fixtures.
 */

const createCaller = tRPCContext.createCallerFactory(serverRouter);

function fakeUser(role: Role): User {
  return {
    id: `fake-${role.toLowerCase()}`,
    name: `Fake ${role}`,
    email: `fake-${role.toLowerCase()}@test.local`,
    phone: null,
    passwordHash: null,
    authProvider: "LOCAL",
    googleId: null,
    avatarUrl: null,
    emailVerified: true,
    role,
    societyId: "fake-society",
    isActive: true,
    importedAt: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function callerFor(user: User | null) {
  return createCaller({ prisma, user });
}

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

// One representative mutation and query per admin-only router.
const adminOnlyCalls = (caller: ReturnType<typeof callerFor>) => [
  caller.society.get(),
  caller.society.update({ name: "X" }),
  caller.tower.create({ name: "X" }),
  caller.tower.list(),
  caller.flat.create({ towerId: "x", flatNumber: "1", floor: 1, type: "OTHER" }),
  caller.flat.list({ limit: 20 }),
  caller.resident.invite({ flatId: "x", email: "x@test.local" }),
  caller.resident.list({ status: "ALL", limit: 20 }),
  caller.resident.deactivate({ userId: "x" }),
  caller.resident.detail({ userId: "x" }),
  caller.resident.updateContact({ userId: "x", email: "x@test.local" }),
  caller.resident.importPreview({
    fileName: "residents.csv",
    fileBase64: Buffer.from("Name,Email,Tower,Flat Number\n", "utf8").toString("base64"),
  }),
  caller.resident.importCommit({
    fileName: "residents.csv",
    fileBase64: Buffer.from("Name,Email,Tower,Flat Number\n", "utf8").toString("base64"),
  }),
  caller.staff.create({
    name: "X",
    email: "x@test.local",
    temporaryPassword: "temp-pass-123",
    role: "GUARD",
  }),
  caller.ticket.assign({ ticketId: "x", assigneeId: "x" }),
  caller.notice.create({ title: "X", body: "X", category: "GENERAL" }),
  caller.notice.delete({ noticeId: "x" }),
  caller.poll.create({
    question: "X?",
    options: ["A", "B"],
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  }),
  caller.amenity.create({ name: "X" }),
  caller.amenityBooking.calendar({ amenityId: "x" }),
  caller.due.generateMonthly({ month: 1, year: 2030, amount: 100 }),
  caller.serviceProvider.create({ name: "X", category: "OTHER", phone: "9000000000" }),
  caller.serviceProvider.delete({ serviceProviderId: "x" }),
];

const residentOnlyCalls = (caller: ReturnType<typeof callerFor>) => [
  caller.familyMember.add({ name: "X", relation: "spouse" }),
  caller.familyMember.remove({ familyMemberId: "x" }),
  caller.vehicle.add({ number: "X-1", type: "CAR" }),
  caller.vehicle.remove({ vehicleId: "x" }),
  caller.visitor.approve({ visitorId: "x" }),
  caller.visitor.deny({ visitorId: "x" }),
  caller.visitor.listPending(),
  caller.guestPreApproval.create({
    guestName: "X",
    guestPhone: "9000000000",
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 3600_000).toISOString(),
  }),
  caller.guestPreApproval.cancel({ preApprovalId: "x" }),
  caller.ticket.create({ category: "OTHER", title: "X", description: "X" }),
  caller.poll.vote({ pollId: "x", optionId: "x" }),
  caller.amenityBooking.create({
    amenityId: "x",
    date: "2099-01-01",
    startTime: "10:00",
    endTime: "11:00",
  }),
  caller.amenityBooking.cancel({ bookingId: "x" }),
  caller.payment.initiate({ targetKind: "DUE", targetId: "x", method: "UPI" }),
  caller.payment.history({ limit: 20 }),
];

const guardOnlyCalls = (caller: ReturnType<typeof callerFor>) => [
  caller.visitor.register({
    name: "X",
    phone: "9000000000",
    purpose: "GUEST",
    flatId: "x",
  }),
  caller.visitor.markEntry({ visitorId: "x" }),
  caller.visitor.markExit({ visitorId: "x" }),
  caller.guestPreApproval.verify({ qrCode: "x" }),
];

describe("admin-only procedures", () => {
  it("reject RESIDENT callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("RESIDENT"));
    for (const call of adminOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject GUARD callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("GUARD"));
    for (const call of adminOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject anonymous callers with UNAUTHORIZED", async () => {
    const caller = callerFor(null);
    await expectTRPCError(caller.society.get(), "UNAUTHORIZED");
    await expectTRPCError(caller.resident.list({ status: "ALL", limit: 20 }), "UNAUTHORIZED");
  });
});

describe("resident-only procedures", () => {
  it("reject GUARD callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("GUARD"));
    for (const call of residentOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject ADMIN callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("ADMIN"));
    for (const call of residentOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject anonymous callers with UNAUTHORIZED", async () => {
    const caller = callerFor(null);
    await expectTRPCError(caller.vehicle.add({ number: "X", type: "CAR" }), "UNAUTHORIZED");
  });
});

describe("guard-only procedures", () => {
  it("reject RESIDENT callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("RESIDENT"));
    for (const call of guardOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject ADMIN callers with FORBIDDEN", async () => {
    const caller = callerFor(fakeUser("ADMIN"));
    for (const call of guardOnlyCalls(caller)) {
      await expectTRPCError(call, "FORBIDDEN");
    }
  });

  it("reject anonymous callers with UNAUTHORIZED", async () => {
    const caller = callerFor(null);
    await expectTRPCError(caller.visitor.markEntry({ visitorId: "x" }), "UNAUTHORIZED");
  });
});

describe("profile procedures (any authenticated role)", () => {
  it("reject anonymous callers with UNAUTHORIZED", async () => {
    const caller = callerFor(null);
    await expectTRPCError(caller.profile.me(), "UNAUTHORIZED");
    await expectTRPCError(caller.profile.update({ name: "X" }), "UNAUTHORIZED");
    await expectTRPCError(
      caller.pushToken.register({ token: "ExponentPushToken[x]", deviceType: "IOS" }),
      "UNAUTHORIZED",
    );
    await expectTRPCError(caller.notification.list({ limit: 20 }), "UNAUTHORIZED");
    await expectTRPCError(caller.notification.markAllRead({}), "UNAUTHORIZED");
    await expectTRPCError(caller.upload.getSignature({ kind: "AVATAR" }), "UNAUTHORIZED");
  });
});
