import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as amenityService from "./amenity.service";

const runId = `am-${Date.now().toString(36)}`;
const tomorrow = () => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

let societyId: string;
let admin: User;
let residentA: User;
let residentB: User;

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
      name: `AM Society ${runId}`,
      address: "1 AM St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `AM-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "AM-101", floor: 1, type: "TWO_BHK" },
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

  admin = await mkUser("AM Admin", "ADMIN");
  residentA = await mkUser("AM Resident A", "RESIDENT", flat.id);
  residentB = await mkUser("AM Resident B", "RESIDENT", flat.id);
});

afterAll(async () => {
  await prisma.amenityBooking.deleteMany({ where: { amenity: { societyId } } });
  await prisma.amenity.deleteMany({ where: { societyId } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("amenity management", () => {
  it("admin creates; residents see only active amenities", async () => {
    const active = await amenityService.createAmenity(admin, {
      name: "Tennis Court",
      pricePerSlot: 100.5,
    });
    expect(active.pricePerSlot).toBe(100.5);

    await amenityService.createAmenity(admin, { name: "Old Gym", isActive: false });

    const residentView = await amenityService.listAmenities(residentA);
    expect(residentView.map((a) => a.name)).toContain("Tennis Court");
    expect(residentView.map((a) => a.name)).not.toContain("Old Gym");

    const adminView = await amenityService.listAmenities(admin);
    expect(adminView.map((a) => a.name)).toContain("Old Gym");
  });

  it("admin deletes an amenity and its bookings; unknown id 404s", async () => {
    const amenity = await amenityService.createAmenity(admin, { name: "Squash Court" });
    await amenityService.createBooking(residentA, {
      amenityId: amenity.id,
      date: "2099-01-01",
      startTime: "10:00",
      endTime: "11:00",
    });

    const res = await amenityService.deleteAmenity(admin, { amenityId: amenity.id });
    expect(res.id).toBe(amenity.id);

    const adminView = await amenityService.listAmenities(admin);
    expect(adminView.map((a) => a.name)).not.toContain("Squash Court");

    const bookings = await prisma.amenityBooking.findMany({
      where: { amenityId: amenity.id },
    });
    expect(bookings).toHaveLength(0);

    await expect(
      amenityService.deleteAmenity(admin, { amenityId: amenity.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("double-booking prevention", () => {
  let amenityId: string;

  beforeAll(async () => {
    const amenity = await amenityService.createAmenity(admin, { name: "Clubhouse" });
    amenityId = amenity.id;
  });

  it("books a free slot", async () => {
    const booking = await amenityService.createBooking(residentA, {
      amenityId,
      date: tomorrow(),
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(booking.status).toBe("BOOKED");
    expect(booking.bookedBy.id).toBe(residentA.id);
  });

  it("rejects every overlapping shape: containing, contained, and straddling", async () => {
    const attempts: Array<[string, string]> = [
      ["10:00", "12:00"], // exact duplicate
      ["09:00", "13:00"], // contains existing
      ["10:30", "11:30"], // inside existing
      ["11:00", "13:00"], // straddles the end
      ["09:00", "10:30"], // straddles the start
    ];
    for (const [startTime, endTime] of attempts) {
      await expectTRPCError(
        amenityService.createBooking(residentB, {
          amenityId,
          date: tomorrow(),
          startTime,
          endTime,
        }),
        "CONFLICT",
      );
    }
  });

  it("allows back-to-back and different-day slots", async () => {
    const backToBack = await amenityService.createBooking(residentB, {
      amenityId,
      date: tomorrow(),
      startTime: "12:00",
      endTime: "13:00",
    });
    expect(backToBack.status).toBe("BOOKED");

    const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const otherDay = await amenityService.createBooking(residentB, {
      amenityId,
      date: dayAfter,
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(otherDay.status).toBe("BOOKED");
  });

  it("a cancelled slot frees the window", async () => {
    const mine = await amenityService.myBookings(residentA, { limit: 50 });
    const target = mine.items.find((b) => b.startTime === "10:00" && b.status === "BOOKED")!;
    const cancelled = await amenityService.cancelBooking(residentA, { bookingId: target.id });
    expect(cancelled.status).toBe("CANCELLED");

    const rebooked = await amenityService.createBooking(residentB, {
      amenityId,
      date: tomorrow(),
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(rebooked.status).toBe("BOOKED");
  });

  it("rejects past slots and inverted times", async () => {
    await expectTRPCError(
      amenityService.createBooking(residentA, {
        amenityId,
        date: "2020-01-01",
        startTime: "10:00",
        endTime: "11:00",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      amenityService.createBooking(residentA, {
        amenityId,
        date: tomorrow(),
        startTime: "15:00",
        endTime: "14:00",
      }),
      "BAD_REQUEST",
    );
  });

  it("rejects booking an inactive amenity", async () => {
    await amenityService.updateAmenity(admin, { amenityId, isActive: false });
    await expectTRPCError(
      amenityService.createBooking(residentA, {
        amenityId,
        date: tomorrow(),
        startTime: "18:00",
        endTime: "19:00",
      }),
      "CONFLICT",
    );
    await amenityService.updateAmenity(admin, { amenityId, isActive: true });
  });

  it("cancel is owner-only and BOOKED-only", async () => {
    const mine = await amenityService.myBookings(residentB, { limit: 50 });
    const target = mine.items.find((b) => b.status === "BOOKED")!;
    await expectTRPCError(
      amenityService.cancelBooking(residentA, { bookingId: target.id }),
      "NOT_FOUND",
    );

    const mineA = await amenityService.myBookings(residentA, { limit: 50 });
    const alreadyCancelled = mineA.items.find((b) => b.status === "CANCELLED")!;
    await expectTRPCError(
      amenityService.cancelBooking(residentA, { bookingId: alreadyCancelled.id }),
      "CONFLICT",
    );
  });

  it("admin calendar shows all bookings for the amenity in range", async () => {
    const calendar = await amenityService.bookingCalendar(admin, { amenityId });
    expect(calendar.length).toBeGreaterThanOrEqual(3);
    expect(calendar.every((b) => b.amenityId === amenityId)).toBe(true);
    // Sorted by date then start time.
    const keys = calendar.map((b) => `${b.date}T${b.startTime}`);
    expect([...keys].sort()).toEqual(keys);
  });
});
