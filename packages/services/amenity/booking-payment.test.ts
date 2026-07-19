import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as amenityService from "./amenity.service";
import * as paymentService from "../dues/payment.service";

/**
 * Chargeable amenity bookings: the slot is held at booking time and only
 * becomes real once payment lands. The concurrency case is the point of the
 * whole design — reserving on payment success instead would let two residents
 * each pay for one slot.
 */

const runId = `bp-${Date.now().toString(36)}`;

let societyId: string;
let residentA: User;
let residentB: User;
let admin: User;
let paidAmenityId: string;
let freeAmenityId: string;

/** A date far enough out that the slot is never in the past mid-run. */
const SLOT_DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

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
      name: `BP Society ${runId}`,
      address: "1 BP St",
      city: "Testville",
      state: "TS",
      pincode: "000003",
      upiVpa: `bp${runId.replace(/-/g, "")}@testbank`,
    },
  });
  societyId = society.id;

  const tower = await prisma.tower.create({ data: { societyId, name: `BP-${runId}` } });
  const flatA = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "BP-101", floor: 1, type: "TWO_BHK" },
  });
  const flatB = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "BP-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "RESIDENT" | "ADMIN", flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  residentA = await mkUser("BP Resident A", "RESIDENT", flatA.id);
  residentB = await mkUser("BP Resident B", "RESIDENT", flatB.id);
  admin = await mkUser("BP Admin", "ADMIN");

  const paid = await prisma.amenity.create({
    data: { societyId, name: `BP Clubhouse ${runId}`, pricePerSlot: 500, cancellationHours: 24 },
  });
  paidAmenityId = paid.id;

  const free = await prisma.amenity.create({
    data: { societyId, name: `BP Park ${runId}` },
  });
  freeAmenityId = free.id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { booking: { amenity: { societyId } } } });
  await prisma.amenityBooking.deleteMany({ where: { amenity: { societyId } } });
  await prisma.amenity.deleteMany({ where: { societyId } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
});

describe("free amenities are unaffected", () => {
  it("books outright with no payment and no hold", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: freeAmenityId,
      date: SLOT_DATE,
      startTime: "08:00",
      endTime: "09:00",
    });
    expect(booking.status).toBe("BOOKED");
    expect(booking.amountDue).toBeNull();
    expect(booking.holdExpiresAt).toBeNull();
  });

  it("refuses to take a payment for a free booking", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: freeAmenityId,
      date: SLOT_DATE,
      startTime: "09:00",
      endTime: "10:00",
    });
    await expectTRPCError(
      paymentService.paymentOptions(residentA, { kind: "BOOKING", id: booking.id }),
      // Already BOOKED, so there is nothing outstanding to pay.
      "CONFLICT",
    );
  });
});

describe("chargeable bookings hold the slot", () => {
  let holdId: string;

  it("creates a PENDING_PAYMENT hold with a price snapshot and an expiry", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "10:00",
      endTime: "11:00",
    });
    holdId = booking.id;
    expect(booking.status).toBe("PENDING_PAYMENT");
    expect(booking.amountDue).toBe(500);
    expect(booking.holdExpiresAt).not.toBeNull();
  });

  it("blocks a second resident from booking the held slot", async () => {
    // The whole point: without the hold counting as live, both residents would
    // create a booking and both would pay for the same hour.
    await expectTRPCError(
      amenityService.createBooking(residentB, {
        amenityId: paidAmenityId,
        date: SLOT_DATE,
        startTime: "10:00",
        endTime: "11:00",
      }),
      "CONFLICT",
    );
  });

  it("blocks an overlapping slot, not just an identical one", async () => {
    await expectTRPCError(
      amenityService.createBooking(residentB, {
        amenityId: paidAmenityId,
        date: SLOT_DATE,
        startTime: "10:30",
        endTime: "11:30",
      }),
      "CONFLICT",
    );
  });

  it("keeps the price it was booked at when the amenity price later changes", async () => {
    await prisma.amenity.update({
      where: { id: paidAmenityId },
      data: { pricePerSlot: 900 },
    });
    const options = await paymentService.paymentOptions(residentA, {
      kind: "BOOKING",
      id: holdId,
    });
    expect(options.amount).toBe(500);
    await prisma.amenity.update({
      where: { id: paidAmenityId },
      data: { pricePerSlot: 500 },
    });
  });

  it("confirms the booking once payment is verified", async () => {
    const payment = await paymentService.submitUpiDirectPayment(residentA, {
      kind: "BOOKING",
      id: holdId,
      utr: `UTR${runId}B`,
    });
    // A booking is owed to the society, so unlike a service bill it is
    // verified rather than believed.
    expect(payment.status).toBe("PENDING_VERIFICATION");
    expect((await prisma.amenityBooking.findUnique({ where: { id: holdId } }))!.status).toBe(
      "PENDING_PAYMENT",
    );

    await paymentService.decideManualPayment(admin, { paymentId: payment.id, approve: true });
    const settled = await prisma.amenityBooking.findUnique({ where: { id: holdId } });
    expect(settled!.status).toBe("BOOKED");
    // A settled booking is no longer sweepable.
    expect(settled!.holdExpiresAt).toBeNull();
  });
});

describe("released holds free the slot", () => {
  it("releases the slot when an admin rejects the payment", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "12:00",
      endTime: "13:00",
    });
    const payment = await paymentService.submitUpiDirectPayment(residentA, {
      kind: "BOOKING",
      id: booking.id,
      utr: `UTR${runId}R`,
    });
    await paymentService.decideManualPayment(admin, {
      paymentId: payment.id,
      approve: false,
      rejectionReason: "No such UTR on our statement",
    });

    // Holding the slot for an unpaid booking would block everyone else, so a
    // rejection releases it rather than leaving it payable like a due.
    const after = await prisma.amenityBooking.findUnique({ where: { id: booking.id } });
    expect(after!.status).toBe("EXPIRED");

    // …and the freed slot is bookable by someone else.
    const rebooked = await amenityService.createBooking(residentB, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "12:00",
      endTime: "13:00",
    });
    expect(rebooked.status).toBe("PENDING_PAYMENT");
  });

  it("sweeps lapsed holds to EXPIRED", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "14:00",
      endTime: "15:00",
    });
    // Backdate the hold rather than waiting 15 minutes.
    await prisma.amenityBooking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    const { expired } = await amenityService.expireLapsedHolds();
    expect(expired).toBeGreaterThanOrEqual(1);
    const after = await prisma.amenityBooking.findUnique({ where: { id: booking.id } });
    expect(after!.status).toBe("EXPIRED");
    expect(after!.holdExpiresAt).toBeNull();
  });

  it("lets a new booking take a slot whose hold lapsed but has not been swept yet", async () => {
    const stale = await amenityService.createBooking(residentA, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "16:00",
      endTime: "17:00",
    });
    await prisma.amenityBooking.update({
      where: { id: stale.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });

    // The sweep runs once a minute; a resident should not have to wait for it.
    const fresh = await amenityService.createBooking(residentB, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "16:00",
      endTime: "17:00",
    });
    expect(fresh.status).toBe("PENDING_PAYMENT");
  });
});

describe("cancellation", () => {
  it("lets a resident abandon their own hold without waiting it out", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId: paidAmenityId,
      date: SLOT_DATE,
      startTime: "18:00",
      endTime: "19:00",
    });
    const cancelled = await amenityService.cancelBooking(residentA, { bookingId: booking.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.holdExpiresAt).toBeNull();
  });

  it("refuses to cancel a paid booking inside its no-refund window", async () => {
    // A slot 2 hours out, on an amenity with a 24-hour free-cancellation window.
    const soon = new Date(Date.now() + 2 * 3_600_000);
    const booking = await prisma.amenityBooking.create({
      data: {
        amenityId: paidAmenityId,
        residentId: (await prisma.residentProfile.findFirstOrThrow({
          where: { user: { id: residentA.id } },
          select: { id: true },
        })).id,
        date: new Date(soon.toISOString().slice(0, 10)),
        startTime: soon.toISOString().slice(11, 16),
        endTime: "23:59",
        status: "BOOKED",
        amountDue: 500,
      },
    });
    await expectTRPCError(
      amenityService.cancelBooking(residentA, { bookingId: booking.id }),
      "CONFLICT",
    );
  });
});
