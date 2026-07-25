import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as detailService from "./resident-detail.service";

const runId = `rdet-${Date.now().toString(36)}`;

let societyId: string;
let otherSocietyId: string;
let flatId: string;
let admin: User;
let otherAdmin: User;
let strayAdmin: User;
let resident: User;
/** Shares `flatId` with `resident` — proves the flat-scoped sections are shared. */
let flatmate: User;
let outsider: User;
let residentProfileId: string;

function email(local: string): string {
  return `${local}-${runId}@test.local`;
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

async function makeSociety(label: string) {
  return prisma.society.create({
    data: {
      name: `${label} ${runId}`,
      address: "1 Detail St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
}

beforeAll(async () => {
  societyId = (await makeSociety("Detail Society")).id;
  otherSocietyId = (await makeSociety("Other Society")).id;

  const tower = await prisma.tower.create({ data: { societyId, name: `T-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "704", floor: 7, type: "THREE_BHK" },
  });
  flatId = flat.id;

  admin = await prisma.user.create({
    data: {
      name: "Detail Admin",
      email: email("admin"),
      role: "ADMIN",
      societyId,
      passwordHash: "x",
    },
  });
  otherAdmin = await prisma.user.create({
    data: {
      name: "Other Admin",
      email: email("other-admin"),
      role: "ADMIN",
      societyId: otherSocietyId,
      passwordHash: "x",
    },
  });
  strayAdmin = await prisma.user.create({
    data: { name: "Stray Admin", email: email("stray"), role: "ADMIN", passwordHash: "x" },
  });

  resident = await prisma.user.create({
    data: {
      name: "Detail Resident",
      email: email("resident"),
      phone: `90000${runId.slice(-5)}`,
      role: "RESIDENT",
      societyId,
      passwordHash: "x",
      emergencyContactName: "Next Of Kin",
      emergencyContactPhone: "9000000000",
      residentProfile: {
        create: {
          flatId,
          isPrimaryResident: true,
          familyMembers: { create: [{ name: "Spouse Person", relation: "Spouse", age: 33 }] },
          vehicles: { create: [{ number: `KA01-${runId.slice(-4)}`, type: "CAR" }] },
        },
      },
    },
    include: { residentProfile: true },
  });
  residentProfileId = (
    await prisma.residentProfile.findUniqueOrThrow({ where: { userId: resident.id } })
  ).id;

  flatmate = await prisma.user.create({
    data: {
      name: "Flatmate",
      email: email("flatmate"),
      role: "RESIDENT",
      societyId,
      passwordHash: "x",
      residentProfile: { create: { flatId } },
    },
  });

  outsider = await prisma.user.create({
    data: { name: "Outsider", email: email("outsider"), role: "RESIDENT", societyId: otherSocietyId, passwordHash: "x" },
  });

  const guard = await prisma.user.create({
    data: {
      name: "Detail Guard",
      email: email("guard"),
      role: "GUARD",
      societyId,
      passwordHash: "x",
    },
  });

  // Flat-scoped: visitors and dues.
  await prisma.visitor.create({
    data: {
      name: "Courier",
      phone: "9111111111",
      purpose: "DELIVERY",
      flatId,
      registeredByGuardId: guard.id,
      status: "APPROVED",
    },
  });
  const due = await prisma.maintenanceDue.create({
    data: { flatId, month: 3, year: 2031, amount: 2500, dueDate: new Date("2031-03-10") },
  });

  // Resident-scoped: complaints, bookings, payments.
  await prisma.helpdeskTicket.create({
    data: {
      referenceCode: `RD-${runId.toUpperCase()}`,
      residentId: residentProfileId,
      flatId,
      category: "PLUMBING",
      title: "Leaking tap",
      description: "Kitchen tap drips",
      status: "OPEN",
    },
  });
  const amenity = await prisma.amenity.create({
    data: { societyId, name: `Clubhouse ${runId}` },
  });
  await prisma.amenityBooking.create({
    data: {
      amenityId: amenity.id,
      residentId: residentProfileId,
      date: new Date("2031-04-01"),
      startTime: "10:00",
      endTime: "11:00",
      status: "BOOKED",
    },
  });
  await prisma.payment.create({
    data: {
      dueId: due.id,
      residentId: residentProfileId,
      amount: 1500,
      method: "UPI",
      status: "SUCCESS",
      paidAt: new Date(),
    },
  });
});

afterAll(async () => {
  const profiles = await prisma.residentProfile.findMany({
    where: { flatId },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);

  await prisma.payment.deleteMany({ where: { residentId: { in: profileIds } } });
  await prisma.amenityBooking.deleteMany({ where: { residentId: { in: profileIds } } });
  await prisma.amenity.deleteMany({ where: { societyId } });
  await prisma.helpdeskTicket.deleteMany({ where: { residentId: { in: profileIds } } });
  await prisma.maintenanceDue.deleteMany({ where: { flatId } });
  await prisma.visitor.deleteMany({ where: { flatId } });
  await prisma.familyMember.deleteMany({ where: { residentProfileId: { in: profileIds } } });
  await prisma.vehicle.deleteMany({ where: { residentProfileId: { in: profileIds } } });
  await prisma.residentProfile.deleteMany({ where: { flatId } });
  await prisma.user.deleteMany({ where: { societyId } });
  await prisma.user.deleteMany({ where: { societyId: otherSocietyId } });
  await prisma.user.deleteMany({ where: { id: strayAdmin.id } });
  await prisma.flat.deleteMany({ where: { id: flatId } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
  await prisma.$disconnect();
});

describe("getResidentDetail — access control", () => {
  it("rejects an admin with no society", async () => {
    await expectTRPCError(
      detailService.getResidentDetail(strayAdmin, { userId: resident.id }),
      "PRECONDITION_FAILED",
    );
  });

  it("hides a resident belonging to another society", async () => {
    await expectTRPCError(
      detailService.getResidentDetail(otherAdmin, { userId: resident.id }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      detailService.getResidentDetail(admin, { userId: outsider.id }),
      "NOT_FOUND",
    );
  });

  it("404s for a user who is not a resident", async () => {
    await expectTRPCError(detailService.getResidentDetail(admin, { userId: admin.id }), "NOT_FOUND");
  });

  it("404s for an unknown id", async () => {
    await expectTRPCError(
      detailService.getResidentDetail(admin, { userId: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe("getResidentDetail — content", () => {
  it("returns identity, flat and emergency contact", async () => {
    const detail = await detailService.getResidentDetail(admin, { userId: resident.id });

    expect(detail.profile.id).toBe(resident.id);
    expect(detail.profile.name).toBe("Detail Resident");
    expect(detail.profile.flatNumber).toBe("704");
    expect(detail.profile.towerName).toBe(`T-${runId}`);
    expect(detail.profile.floor).toBe(7);
    expect(detail.profile.flatType).toBe("THREE_BHK");
    expect(detail.profile.isPrimaryResident).toBe(true);
    expect(detail.profile.emergencyContactName).toBe("Next Of Kin");
    expect(detail.profile.isActive).toBe(true);
  });

  it("returns the household and vehicles", async () => {
    const detail = await detailService.getResidentDetail(admin, { userId: resident.id });

    expect(detail.familyMembers).toHaveLength(1);
    expect(detail.familyMembers[0]!.relation).toBe("Spouse");
    expect(detail.vehicles).toHaveLength(1);
    expect(detail.vehicles[0]!.type).toBe("CAR");
  });

  it("returns complaints, bookings and payments scoped to this resident", async () => {
    const detail = await detailService.getResidentDetail(admin, { userId: resident.id });

    expect(detail.tickets).toHaveLength(1);
    expect(detail.tickets[0]!.title).toBe("Leaking tap");
    expect(detail.tickets[0]!.assignedToName).toBeNull();

    expect(detail.bookings).toHaveLength(1);
    expect(detail.bookings[0]!.amenityName).toBe(`Clubhouse ${runId}`);
    expect(detail.bookings[0]!.amountDue).toBeNull();

    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0]!.amount).toBe(1500);
    // Resolved to a label rather than a raw FK.
    expect(detail.payments[0]!.target).toBe("Maintenance 3/2031");
  });

  it("computes the summary totals", async () => {
    const detail = await detailService.getResidentDetail(admin, { userId: resident.id });

    expect(detail.summary.familyCount).toBe(1);
    expect(detail.summary.vehicleCount).toBe(1);
    expect(detail.summary.ticketCount).toBe(1);
    expect(detail.summary.openTicketCount).toBe(1);
    expect(detail.summary.bookingCount).toBe(1);
    expect(detail.summary.visitorCount).toBe(1);
    // The 2500 due is unpaid; the 1500 payment succeeded.
    expect(detail.summary.outstandingDue).toBe(2500);
    expect(detail.summary.totalPaid).toBe(1500);
  });

  /**
   * Visitors and dues hang off Flat, not ResidentProfile, so flatmates
   * legitimately see the same rows. Pinned so the sharing stays deliberate.
   */
  it("shares the flat-scoped sections with a flatmate, but not the personal ones", async () => {
    const mine = await detailService.getResidentDetail(admin, { userId: resident.id });
    const theirs = await detailService.getResidentDetail(admin, { userId: flatmate.id });

    expect(theirs.visitors.map((v) => v.id)).toEqual(mine.visitors.map((v) => v.id));
    expect(theirs.dues.map((d) => d.id)).toEqual(mine.dues.map((d) => d.id));

    expect(theirs.tickets).toHaveLength(0);
    expect(theirs.bookings).toHaveLength(0);
    expect(theirs.payments).toHaveLength(0);
    expect(theirs.summary.totalPaid).toBe(0);
    expect(theirs.profile.isPrimaryResident).toBe(false);
  });
});
