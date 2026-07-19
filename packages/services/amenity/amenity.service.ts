import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type BookingStatus } from "@repo/database";
import { assertCloudinaryUrls } from "@repo/cloudinary";

import {
  notifyUsers,
  societyAdminUserIds,
} from "../notification/notification.service";

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
  assertCloudinaryUrls(input.photoUrls);
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
  assertCloudinaryUrls(input.photoUrls);
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

/**
 * Permanently delete an amenity and all of its bookings (admin only,
 * society-scoped). Prefer `updateAmenity({ isActive: false })` to merely hide it
 * from residents while keeping booking history.
 */
export async function deleteAmenity(
  actor: User,
  input: { amenityId: string },
): Promise<{ id: string }> {
  const amenity = await prisma.amenity.findFirst({
    where: { id: input.amenityId, societyId: actorSocietyId(actor) },
  });
  if (!amenity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Amenity not found" });
  }
  // Bookings FK-reference the amenity — remove them in the same transaction.
  await prisma.$transaction([
    prisma.amenityBooking.deleteMany({ where: { amenityId: amenity.id } }),
    prisma.amenity.delete({ where: { id: amenity.id } }),
  ]);
  return { id: amenity.id };
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

/**
 * How long a chargeable slot stays held while its payment is outstanding.
 *
 * Long enough to finish a UPI hop out to another app and back; short enough
 * that an abandoned checkout does not park a popular slot all evening.
 */
const PAYMENT_HOLD_MINUTES = 15;

export interface BookingInfo {
  id: string;
  amenityId: string;
  amenityName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  status: BookingStatus;
  /** null on free amenities; the price snapshot otherwise. */
  amountDue: number | null;
  /** When a PENDING_PAYMENT hold lapses. Null once settled or on free slots. */
  holdExpiresAt: string | null;
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
    amountDue: booking.amountDue === null ? null : Number(booking.amountDue),
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
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

  // A chargeable amenity holds the slot while payment is outstanding; a free
  // one books outright. Price is snapshotted so a later change to
  // pricePerSlot cannot alter what an existing booking owes.
  const chargeable = amenity.pricePerSlot !== null;
  const now = new Date();

  const booking = await prisma.$transaction(async (tx) => {
    // Overlap: an existing live slot on the same amenity+date that starts
    // before this one ends and ends after this one starts. PENDING_PAYMENT
    // counts as live — otherwise two residents could each pay for one slot.
    const clash = await tx.amenityBooking.findFirst({
      where: {
        amenityId: amenity.id,
        date: new Date(input.date),
        status: { in: ["BOOKED", "PENDING_PAYMENT"] },
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
        // An expired hold no longer owns the slot even if the sweep has not
        // reached it yet, so a stale row cannot block a real booking.
        NOT: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
      },
    });
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          clash.status === "PENDING_PAYMENT"
            ? `That slot is held by another resident's payment (${clash.startTime}–${clash.endTime}); try again shortly`
            : `That slot overlaps an existing booking (${clash.startTime}–${clash.endTime})`,
      });
    }
    return tx.amenityBooking.create({
      data: {
        amenityId: amenity.id,
        residentId: residentProfileId,
        date: new Date(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
        ...(chargeable
          ? {
              status: "PENDING_PAYMENT" as const,
              amountDue: amenity.pricePerSlot,
              holdExpiresAt: new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60_000),
            }
          : {}),
      },
      include: bookingInclude,
    });
  });

  // Only a settled booking is worth telling admins about — a hold may never
  // become one, and notifying on every abandoned checkout would be noise.
  if (!chargeable) {
    await notifyUsers(await societyAdminUserIds(amenity.societyId), {
      type: "BOOKING_CONFIRMED",
      title: "New amenity booking",
      body: `${actor.name} booked ${amenity.name} · ${input.date} ${input.startTime}–${input.endTime}`,
      data: { amenityId: amenity.id },
    });
  }

  return toBookingInfo(booking);
}

/**
 * Release chargeable holds whose payment never landed.
 *
 * Runs from the api's periodic sweep alongside the overdue-dues pass. Without
 * it an abandoned checkout parks the slot until the date passes — the overlap
 * check already ignores lapsed holds, so this is about keeping the data honest
 * and telling the resident, not about correctness of new bookings.
 */
export async function expireLapsedHolds(): Promise<{ expired: number }> {
  const lapsed = await prisma.amenityBooking.findMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: new Date() } },
    include: { resident: { select: { userId: true } }, amenity: { select: { name: true } } },
  });
  if (lapsed.length === 0) return { expired: 0 };

  await prisma.amenityBooking.updateMany({
    where: { id: { in: lapsed.map((b) => b.id) } },
    data: { status: "EXPIRED", holdExpiresAt: null },
  });

  for (const booking of lapsed) {
    await notifyUsers([booking.resident.userId], {
      type: "BOOKING_PAYMENT_EXPIRED",
      title: "Booking released",
      body: `Your hold on ${booking.amenity.name} · ${booking.date.toISOString().slice(0, 10)} ${booking.startTime}–${booking.endTime} expired before payment. The slot is free again.`,
      data: { amenityId: booking.amenityId, bookingId: booking.id },
    });
  }

  return { expired: lapsed.length };
}

export async function cancelBooking(
  actor: User,
  input: { bookingId: string },
): Promise<BookingInfo> {
  const residentProfileId = await actorResidentProfileId(actor);
  const booking = await prisma.amenityBooking.findFirst({
    where: { id: input.bookingId, residentId: residentProfileId },
    include: { ...bookingInclude, amenity: { select: { name: true, cancellationHours: true } } },
  });
  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
  }
  // A hold can be abandoned as well as a confirmed booking — the resident
  // changed their mind at the payment screen and should not have to wait out
  // the hold to free the slot for someone else.
  if (booking.status !== "BOOKED" && booking.status !== "PENDING_PAYMENT") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Only booked or held slots can be cancelled — this one is ${booking.status}`,
    });
  }

  const start = slotStart(booking.date.toISOString().slice(0, 10), booking.startTime);
  if (start < new Date()) {
    throw new TRPCError({ code: "CONFLICT", message: "This slot has already started" });
  }

  // Paid bookings have a free-cancellation window; inside it there is no
  // refund, so the resident is told rather than silently losing the money.
  // (The refund itself rides on Route's on-hold transfers — see docs/payments.md E21.)
  if (booking.status === "BOOKED" && booking.amountDue !== null) {
    const hoursToSlot = (start.getTime() - Date.now()) / 3_600_000;
    if (hoursToSlot < booking.amenity.cancellationHours) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Paid bookings can only be cancelled at least ${booking.amenity.cancellationHours} hours before the slot`,
      });
    }
  }

  const cancelled = await prisma.amenityBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", holdExpiresAt: null },
    include: bookingInclude,
  });

  await notifyUsers(await societyAdminUserIds(actorSocietyId(actor)), {
    type: "BOOKING_CANCELLED",
    title: "Booking cancelled",
    body: `${actor.name} cancelled ${cancelled.amenity.name} · ${booking.date.toISOString().slice(0, 10)} ${booking.startTime}–${booking.endTime}`,
    data: { amenityId: cancelled.amenityId },
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
