import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type BookingStatus } from "@repo/database";

/**
 * Amenities and slot bookings. Admins manage amenities; residents book
 * slots ("HH:mm" times on a calendar date). Overlapping BOOKED slots on the
 * same amenity + date are rejected — the check runs inside a transaction to
 * narrow the double-booking race window.
 */

export interface AmenityInfo {
  id: string;
  name: string;
  description: string | null;
  photoUrls: string[];
  rules: string | null;
  pricePerSlot: number | null;
  isActive: boolean;
}

function toAmenityInfo(amenity: {
  id: string;
  name: string;
  description: string | null;
  photoUrls: string[];
  rules: string | null;
  pricePerSlot: Prisma.Decimal | null;
  isActive: boolean;
}): AmenityInfo {
  return {
    id: amenity.id,
    name: amenity.name,
    description: amenity.description,
    photoUrls: amenity.photoUrls,
    rules: amenity.rules,
    pricePerSlot: amenity.pricePerSlot === null ? null : Number(amenity.pricePerSlot),
    isActive: amenity.isActive,
  };
}

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

export async function createAmenity(
  actor: User,
  input: {
    name: string;
    description?: string;
    photoUrls?: string[];
    rules?: string;
    pricePerSlot?: number;
    isActive?: boolean;
  },
): Promise<AmenityInfo> {
  const societyId = actorSocietyId(actor);
  const amenity = await prisma.amenity.create({
    data: {
      societyId,
      name: input.name,
      description: input.description,
      photoUrls: input.photoUrls ?? [],
      rules: input.rules,
      pricePerSlot: input.pricePerSlot,
      isActive: input.isActive ?? true,
    },
  });
  return toAmenityInfo(amenity);
}

export async function updateAmenity(
  actor: User,
  input: {
    amenityId: string;
    name?: string;
    description?: string;
    photoUrls?: string[];
    rules?: string;
    pricePerSlot?: number | null;
    isActive?: boolean;
  },
): Promise<AmenityInfo> {
  const amenity = await prisma.amenity.findFirst({
    where: { id: input.amenityId, societyId: actorSocietyId(actor) },
  });
  if (!amenity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Amenity not found" });
  }
  const updated = await prisma.amenity.update({
    where: { id: amenity.id },
    data: {
      name: input.name,
      description: input.description,
      photoUrls: input.photoUrls,
      rules: input.rules,
      pricePerSlot: input.pricePerSlot,
      isActive: input.isActive,
    },
  });
  return toAmenityInfo(updated);
}

/** Admins see all amenities; everyone else sees only active ones. */
export async function listAmenities(actor: User): Promise<AmenityInfo[]> {
  const societyId = actorSocietyId(actor);
  const amenities = await prisma.amenity.findMany({
    where: { societyId, ...(actor.role === "ADMIN" ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
  return amenities.map(toAmenityInfo);
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface BookingInfo {
  id: string;
  amenityId: string;
  amenityName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  status: BookingStatus;
  bookedBy: { id: string; name: string; flatNumber: string };
  createdAt: string;
}

const bookingInclude = {
  amenity: { select: { name: true } },
  resident: {
    include: {
      user: { select: { id: true, name: true } },
      flat: { select: { flatNumber: true } },
    },
  },
} satisfies Prisma.AmenityBookingInclude;

type BookingRow = Prisma.AmenityBookingGetPayload<{ include: typeof bookingInclude }>;

function toBookingInfo(booking: BookingRow): BookingInfo {
  return {
    id: booking.id,
    amenityId: booking.amenityId,
    amenityName: booking.amenity.name,
    date: booking.date.toISOString().slice(0, 10),
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    bookedBy: {
      id: booking.resident.user.id,
      name: booking.resident.user.name,
      flatNumber: booking.resident.flat.flatNumber,
    },
    createdAt: booking.createdAt.toISOString(),
  };
}

async function actorResidentProfileId(actor: User): Promise<string> {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile.id;
}

/** Turns "YYYY-MM-DD" + "HH:mm" into a UTC Date for past/future checks. */
function slotStart(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00.000Z`);
}

export async function createBooking(
  actor: User,
  input: { amenityId: string; date: string; startTime: string; endTime: string },
): Promise<BookingInfo> {
  const residentProfileId = await actorResidentProfileId(actor);
  const amenity = await prisma.amenity.findFirst({
    where: { id: input.amenityId, societyId: actorSocietyId(actor) },
  });
  if (!amenity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Amenity not found" });
  }
  if (!amenity.isActive) {
    throw new TRPCError({ code: "CONFLICT", message: "This amenity is not open for booking" });
  }
  if (input.endTime <= input.startTime) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "endTime must be after startTime" });
  }
  if (slotStart(input.date, input.startTime) < new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The slot is in the past" });
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Overlap: an existing BOOKED slot on the same amenity+date that starts
    // before this one ends and ends after this one starts.
    const clash = await tx.amenityBooking.findFirst({
      where: {
        amenityId: amenity.id,
        date: new Date(input.date),
        status: "BOOKED",
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
      },
    });
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `That slot overlaps an existing booking (${clash.startTime}–${clash.endTime})`,
      });
    }
    return tx.amenityBooking.create({
      data: {
        amenityId: amenity.id,
        residentId: residentProfileId,
        date: new Date(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
      },
      include: bookingInclude,
    });
  });

  return toBookingInfo(booking);
}

export async function cancelBooking(
  actor: User,
  input: { bookingId: string },
): Promise<BookingInfo> {
  const residentProfileId = await actorResidentProfileId(actor);
  const booking = await prisma.amenityBooking.findFirst({
    where: { id: input.bookingId, residentId: residentProfileId },
    include: bookingInclude,
  });
  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
  }
  if (booking.status !== "BOOKED") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Only BOOKED slots can be cancelled — this one is ${booking.status}`,
    });
  }
  if (slotStart(booking.date.toISOString().slice(0, 10), booking.startTime) < new Date()) {
    throw new TRPCError({ code: "CONFLICT", message: "This slot has already started" });
  }

  const cancelled = await prisma.amenityBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
    include: bookingInclude,
  });
  return toBookingInfo(cancelled);
}

export async function myBookings(
  actor: User,
  input: { cursor?: string; limit: number },
): Promise<{ items: BookingInfo[]; nextCursor: string | null }> {
  const residentProfileId = await actorResidentProfileId(actor);
  const bookings = await prisma.amenityBooking.findMany({
    where: { residentId: residentProfileId },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: bookingInclude,
  });
  const hasMore = bookings.length > input.limit;
  const items = (hasMore ? bookings.slice(0, input.limit) : bookings).map(toBookingInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/** Admin's calendar of an amenity's bookings over a date range. */
export async function bookingCalendar(
  actor: User,
  input: { amenityId: string; from?: string; to?: string },
): Promise<BookingInfo[]> {
  const amenity = await prisma.amenity.findFirst({
    where: { id: input.amenityId, societyId: actorSocietyId(actor) },
  });
  if (!amenity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Amenity not found" });
  }

  const from = input.from ? new Date(input.from) : new Date(new Date().toISOString().slice(0, 10));
  const to = input.to
    ? new Date(input.to)
    : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (to < from) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "'to' must not be before 'from'" });
  }

  const bookings = await prisma.amenityBooking.findMany({
    where: { amenityId: amenity.id, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: bookingInclude,
  });
  return bookings.map(toBookingInfo);
}
