import { amenityService } from "@repo/services";

import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, subscribedAdminProcedure, protectedProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const amenityPath = generatePath("v1/amenities");
const bookingPath = generatePath("v1/amenity-bookings");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeField = (what: string) =>
  z.string().regex(TIME_RE, "Expected 'HH:mm' 24h").describe(`${what} as 'HH:mm' (24h)`);

const AmenityModel = z
  .object({
    id: z.string().describe("Amenity id"),
    name: z.string().describe("Amenity name"),
    description: z.string().nullable().describe("Description, if set"),
    photoUrls: z.array(z.string()).describe("Photo URLs"),
    rules: z.string().nullable().describe("Usage rules, if set"),
    pricePerSlot: z.number().nullable().describe("Price per slot; null when free"),
    isActive: z.boolean().describe("Whether the amenity is open for booking"),
  })
  .describe("A society amenity");

const BookingStatusEnum = z
  .enum(["PENDING_PAYMENT", "BOOKED", "CANCELLED", "EXPIRED", "COMPLETED"])
  .describe(
    "Booking status. PENDING_PAYMENT holds the slot for a chargeable amenity while payment is " +
      "outstanding; EXPIRED means that hold lapsed and the slot was released",
  );

const BookingModel = z
  .object({
    id: z.string().describe("Booking id"),
    amenityId: z.string().describe("Booked amenity id"),
    amenityName: z.string().describe("Booked amenity name"),
    date: z.string().describe("Booking date 'YYYY-MM-DD'"),
    startTime: timeField("Slot start"),
    endTime: timeField("Slot end"),
    status: BookingStatusEnum,
    amountDue: z
      .number()
      .nullable()
      .describe("Price snapshotted at booking time; null on free amenities"),
    holdExpiresAt: z
      .string()
      .nullable()
      .describe("When a PENDING_PAYMENT hold lapses; null once settled or on free slots"),
    bookedBy: z
      .object({
        id: z.string().describe("User id"),
        name: z.string().describe("Full name"),
        flatNumber: z.string().describe("Flat number"),
      })
      .describe("Resident who booked the slot"),
    createdAt: z.string().describe("ISO creation time"),
  })
  .describe("An amenity slot booking");

const CreateAmenityInput = z.object({
  name: z.string().min(1).describe("Amenity name"),
  description: z.string().describe("Description").optional(),
  photoUrls: z.array(z.url()).max(5).describe("Photo URLs (Cloudinary, Phase 9)").optional(),
  rules: z.string().describe("Usage rules shown to residents").optional(),
  pricePerSlot: z.number().nonnegative().describe("Price per slot; omit when free").optional(),
  isActive: z.boolean().describe("Open for booking (default true)").optional(),
});

const UpdateAmenityInput = z.object({
  amenityId: z.string().describe("Id of the amenity to update"),
  name: z.string().min(1).describe("New name").optional(),
  description: z.string().describe("New description").optional(),
  photoUrls: z.array(z.url()).max(5).describe("New photo URLs").optional(),
  rules: z.string().describe("New usage rules").optional(),
  pricePerSlot: z
    .number()
    .nonnegative()
    .describe("New price; pass null to make it free")
    .nullable()
    .optional(),
  isActive: z.boolean().describe("Open/close for booking").optional(),
});

const CreateBookingInput = z.object({
  amenityId: z.string().describe("Amenity to book"),
  date: z.iso.date().describe("Booking date 'YYYY-MM-DD'"),
  startTime: timeField("Slot start"),
  endTime: timeField("Slot end"),
});

const BookingIdInput = z.object({
  bookingId: z.string().describe("Id of the booking"),
});

const MyBookingsInput = z.object({
  status: BookingStatusEnum.describe("Only bookings in this state").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last booking from the previous page").optional(),
});

const CalendarInput = z.object({
  amenityId: z.string().describe("Amenity to view"),
  from: z.iso.date().describe("Range start 'YYYY-MM-DD' (default today)").optional(),
  to: z.iso.date().describe("Range end 'YYYY-MM-DD' (default from + 30 days)").optional(),
});

export const amenityRouter = router({
  create: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: amenityPath(""),
        tags: ["Amenities"],
        summary: "Create an amenity",
        description:
          "Admin adds an amenity (gym, clubhouse, court…) to their society. " +
          "Errors: 403 if not an admin.",
        protect: true,
      },
    })
    .input(CreateAmenityInput)
    .output(AmenityModel)
    .mutation(({ ctx, input }) => amenityService.createAmenity(ctx.user, input)),

  update: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: amenityPath("{amenityId}"),
        tags: ["Amenities"],
        summary: "Update an amenity",
        description:
          "Partially updates an amenity of the admin's society; set isActive false to " +
          "close it for new bookings. Errors: 403 if not an admin, 404 if the amenity " +
          "is not in the admin's society.",
        protect: true,
      },
    })
    .input(UpdateAmenityInput)
    .output(AmenityModel)
    .mutation(({ ctx, input }) => amenityService.updateAmenity(ctx.user, input)),

  delete: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: amenityPath("{amenityId}"),
        tags: ["Amenities"],
        summary: "Delete an amenity",
        description:
          "Permanently deletes an amenity of the admin's society along with all of its " +
          "bookings. To merely hide it from residents while keeping history, PATCH " +
          "isActive to false instead. Errors: 403 if not an admin, 404 if the amenity is " +
          "not in the admin's society.",
        protect: true,
      },
    })
    .input(z.object({ amenityId: z.string().describe("Id of the amenity to delete") }))
    .output(z.object({ id: z.string().describe("Id of the deleted amenity") }))
    .mutation(({ ctx, input }) => amenityService.deleteAmenity(ctx.user, input)),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: amenityPath(""),
        tags: ["Amenities"],
        summary: "List the society's amenities",
        description:
          "Amenities of the caller's society, sorted by name. Admins also see inactive " +
          "ones. Errors: 401 if not authenticated, 412 if the account is not linked to " +
          "a society.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(z.array(AmenityModel))
    .query(({ ctx }) => amenityService.listAmenities(ctx.user)),
});

export const amenityBookingRouter = router({
  create: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: bookingPath(""),
        tags: ["Amenities"],
        summary: "Book an amenity slot",
        description:
          "Resident books a time slot on an active amenity. The slot must be in the " +
          "future and must not overlap any existing BOOKED slot for that amenity and " +
          "date. Errors: 400 for an invalid/past slot, 403 if not a resident, 404 if " +
          "the amenity is not in the caller's society, 409 if the amenity is closed or " +
          "the slot overlaps an existing booking.",
        protect: true,
      },
    })
    .input(CreateBookingInput)
    .output(BookingModel)
    .mutation(({ ctx, input }) => amenityService.createBooking(ctx.user, input)),

  cancel: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: bookingPath("{bookingId}/cancel"),
        tags: ["Amenities"],
        summary: "Cancel a booking",
        description:
          "Resident cancels one of their own BOOKED slots before it starts. " +
          "Errors: 403 if not a resident, 404 if the booking does not belong to the " +
          "caller, 409 if it is not BOOKED or has already started.",
        protect: true,
      },
    })
    .input(BookingIdInput)
    .output(BookingModel)
    .mutation(({ ctx, input }) => amenityService.cancelBooking(ctx.user, input)),

  myBookings: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: bookingPath("mine"),
        tags: ["Amenities"],
        summary: "List the caller's bookings",
        description:
          "Cursor-paginated bookings of the calling resident, most recent date first. " +
          "Pass `status` to narrow to one state — PENDING_PAYMENT answers 'what do I still " +
          "owe for a slot I am holding'. Errors: 403 if not a resident, 412 if the account " +
          "has no resident profile.",
        protect: true,
      },
    })
    .input(MyBookingsInput)
    .output(
      z.object({
        items: z.array(BookingModel).describe("Bookings on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => amenityService.myBookings(ctx.user, input)),

  calendar: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: bookingPath("calendar"),
        tags: ["Amenities"],
        summary: "Admin calendar of an amenity's bookings",
        description:
          "Every booking (any status) for one amenity across a date range, ordered by " +
          "date and start time. Defaults to the next 30 days. Errors: 400 for an " +
          "inverted range, 403 if not an admin, 404 if the amenity is not in the " +
          "admin's society.",
        protect: true,
      },
    })
    .input(CalendarInput)
    .output(z.array(BookingModel))
    .query(({ ctx, input }) => amenityService.bookingCalendar(ctx.user, input)),
});
