import { residentDetailService, residentImportService, residentService } from "@repo/services";

import { phoneSchema, z } from "../../schema";
import { adminProcedure, subscribedAdminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";
import { FlatTypeEnum } from "../society/route";

const path = generatePath("v1/residents");

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const InviteModel = z
  .object({
    id: z.string().describe("Invite id"),
    flatId: z.string().describe("Flat the invitee will be linked to"),
    email: z.string().nullable().describe("Invited email, if any"),
    phone: z.string().nullable().describe("Invited phone, if any"),
    status: z.enum(["PENDING", "CLAIMED"]).describe("Invite status"),
    createdAt: z.string().describe("ISO timestamp the invite was created"),
  })
  .describe("A pending resident invite");

const ResidentModel = z
  .object({
    id: z.string().describe("User id"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email, if set"),
    phone: z.string().nullable().describe("Phone, if set"),
    avatarUrl: z.string().nullable().describe("Profile photo URL, if set"),
    isActive: z.boolean().describe("Whether the account is active"),
    flatId: z.string().describe("Id of the resident's flat"),
    flatNumber: z.string().describe("Flat number"),
    towerId: z.string().describe("Id of the flat's tower"),
    towerName: z.string().describe("Name of the flat's tower"),
    isPrimaryResident: z.boolean().describe("Whether this is the flat's primary resident"),
    createdAt: z.string().describe("ISO timestamp the account was created"),
  })
  .describe("A resident of the society");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const InviteResidentInput = z.object({
  flatId: z.string().describe("Flat to link the future resident to"),
  email: z.email().describe("Invitee email (this or phone required)").optional(),
  phone: phoneSchema.describe("Invitee's 10-digit phone (this or email required)").optional(),
});

const ListResidentsInput = z.object({
  towerId: z.string().describe("Only residents of this tower").optional(),
  flatId: z.string().describe("Only residents of this flat").optional(),
  status: z
    .enum(["ACTIVE", "INACTIVE", "ALL"])
    .default("ALL")
    .describe("Filter by account status"),
  search: z.string().describe("Match against name, email, or phone").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last resident from the previous page").optional(),
});

const ResidentIdInput = z.object({
  userId: z.string().describe("User id of the resident"),
});

const ActiveStateModel = z.object({
  id: z.string().describe("User id"),
  isActive: z.boolean().describe("Account active state after the change"),
});

const ResidentContactInput = z.object({
  userId: z.string().describe("User id of the resident"),
  email: z.email().describe("Email to fill in, if the resident has none").optional(),
  phone: phoneSchema.describe("10-digit phone to fill in, if the resident has none").optional(),
});

const ResidentContactModel = z.object({
  id: z.string().describe("User id"),
  email: z.string().nullable().describe("Email after the change"),
  phone: z.string().nullable().describe("Phone after the change"),
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

// Declared locally rather than imported across route files, matching how every
// other router spells its own enums.
const VehicleTypeEnum = z.enum(["CAR", "BIKE", "OTHER"]).describe("Vehicle type");
const VisitorPurposeEnum = z
  .enum(["GUEST", "DELIVERY", "CAB", "SERVICE_STAFF", "OTHER"])
  .describe("Why the visitor came");
const VisitorStatusEnum = z
  .enum(["PENDING", "APPROVED", "DENIED", "EXPIRED"])
  .describe("Visitor request status");
const TicketCategoryEnum = z
  .enum(["PLUMBING", "ELECTRICAL", "HOUSEKEEPING", "SECURITY", "OTHER"])
  .describe("Complaint category");
const TicketPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Complaint priority");
const TicketStatusEnum = z
  .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  .describe("Complaint status");
const BookingStatusEnum = z
  .enum(["PENDING_PAYMENT", "BOOKED", "CANCELLED", "EXPIRED", "COMPLETED"])
  .describe(
    "Booking status. PENDING_PAYMENT holds the slot for a chargeable amenity while payment is " +
      "outstanding; EXPIRED means that hold lapsed and the slot was released",
  );
const DueStatusEnum = z.enum(["PENDING", "PAID", "OVERDUE"]).describe("Due status");
const PaymentMethodEnum = z
  .enum(["UPI", "CARD", "NETBANKING", "OFFLINE", "UPI_DIRECT"])
  .describe("How the payment was made");
const PaymentStatusEnum = z
  .enum(["INITIATED", "SUCCESS", "FAILED", "PENDING_VERIFICATION", "REJECTED"])
  .describe("Payment status");

const ResidentDetailProfileModel = z
  .object({
    id: z.string().describe("User id"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email, if set"),
    phone: z.string().nullable().describe("Phone, if set"),
    avatarUrl: z.string().nullable().describe("Profile photo URL, if set"),
    isActive: z.boolean().describe("Whether the account is active"),
    importedAt: z
      .string()
      .nullable()
      .describe("Set while a bulk-imported resident has not claimed their account yet"),
    emergencyContactName: z.string().nullable().describe("Emergency contact name, if set"),
    emergencyContactPhone: z.string().nullable().describe("Emergency contact phone, if set"),
    joinedAt: z.string().describe("ISO timestamp the account was created"),
    flatId: z.string().describe("Id of the resident's flat"),
    flatNumber: z.string().describe("Flat number"),
    towerName: z.string().describe("Tower name"),
    floor: z.number().describe("Floor the flat is on"),
    flatType: FlatTypeEnum,
    isPrimaryResident: z.boolean().describe("Whether this is the flat's primary resident"),
    moveInDate: z.string().nullable().describe("ISO move-in date, if recorded"),
  })
  .describe("Identity, contact and flat details for one resident");

const ResidentFamilyMemberModel = z
  .object({
    id: z.string().describe("Family member id"),
    name: z.string().describe("Full name"),
    relation: z.string().describe("Relation to the resident, e.g. Spouse"),
    age: z.number().nullable().describe("Age, if recorded"),
    photoUrl: z.string().nullable().describe("Photo URL, if set"),
  })
  .describe("A member of the resident's household");

const ResidentVehicleModel = z
  .object({
    id: z.string().describe("Vehicle id"),
    number: z.string().describe("Registration number"),
    type: VehicleTypeEnum,
  })
  .describe("A vehicle registered to the resident");

const ResidentVisitorEntryModel = z
  .object({
    id: z.string().describe("Visitor id"),
    name: z.string().describe("Visitor's name"),
    phone: z.string().describe("Visitor's phone"),
    purpose: VisitorPurposeEnum,
    status: VisitorStatusEnum,
    vehicleNumber: z.string().nullable().describe("Vehicle number, if recorded"),
    entryTime: z.string().nullable().describe("ISO entry time, if they came in"),
    exitTime: z.string().nullable().describe("ISO exit time, if they left"),
    createdAt: z.string().describe("ISO timestamp the visitor was registered"),
  })
  .describe("One visitor to the resident's flat");

const ResidentTicketEntryModel = z
  .object({
    id: z.string().describe("Ticket id"),
    referenceCode: z.string().describe("Human-readable reference code"),
    title: z.string().describe("Complaint title"),
    category: TicketCategoryEnum,
    priority: TicketPriorityEnum,
    status: TicketStatusEnum,
    assignedToName: z.string().nullable().describe("Assignee's name, if assigned"),
    createdAt: z.string().describe("ISO timestamp the complaint was raised"),
  })
  .describe("One complaint raised by the resident");

const ResidentBookingEntryModel = z
  .object({
    id: z.string().describe("Booking id"),
    amenityName: z.string().describe("Amenity that was booked"),
    date: z.string().describe("ISO date of the booking"),
    startTime: z.string().describe("Slot start, HH:mm"),
    endTime: z.string().describe("Slot end, HH:mm"),
    status: BookingStatusEnum,
    amountDue: z.number().nullable().describe("Price snapshot; null for a free amenity"),
    createdAt: z.string().describe("ISO timestamp the booking was made"),
  })
  .describe("One amenity booking by the resident");

const ResidentDueEntryModel = z
  .object({
    id: z.string().describe("Due id"),
    month: z.number().describe("Billing month, 1-12"),
    year: z.number().describe("Billing year"),
    amount: z.number().describe("Amount billed"),
    dueDate: z.string().describe("ISO date the due is payable by"),
    status: DueStatusEnum,
  })
  .describe("One maintenance due billed to the resident's flat");

const ResidentPaymentEntryModel = z
  .object({
    id: z.string().describe("Payment id"),
    target: z.string().describe("What was paid for, as a human-readable label"),
    amount: z.number().describe("Amount paid"),
    method: PaymentMethodEnum,
    status: PaymentStatusEnum,
    transactionId: z.string().nullable().describe("Gateway transaction id, if any"),
    upiUtr: z.string().nullable().describe("Payer-entered UTR for UPI-direct payments"),
    paidAt: z.string().nullable().describe("ISO timestamp the payment settled, if it did"),
    createdAt: z.string().describe("ISO timestamp the payment was started"),
  })
  .describe("One payment made by the resident");

const ResidentDetailModel = z
  .object({
    profile: ResidentDetailProfileModel,
    familyMembers: z.array(ResidentFamilyMemberModel).describe("The resident's household"),
    vehicles: z.array(ResidentVehicleModel).describe("Vehicles registered to the resident"),
    visitors: z
      .array(ResidentVisitorEntryModel)
      .describe(
        "Visitors to the resident's FLAT, newest first — visitors belong to a flat, so " +
          "flatmates share this list",
      ),
    tickets: z.array(ResidentTicketEntryModel).describe("Complaints raised by the resident"),
    bookings: z.array(ResidentBookingEntryModel).describe("Amenity bookings by the resident"),
    dues: z
      .array(ResidentDueEntryModel)
      .describe(
        "Maintenance dues billed to the resident's FLAT, newest first — dues are billed to a " +
          "flat, so flatmates share this list",
      ),
    payments: z.array(ResidentPaymentEntryModel).describe("Payments made by the resident"),
    summary: z
      .object({
        familyCount: z.number().describe("Household members"),
        vehicleCount: z.number().describe("Registered vehicles"),
        visitorCount: z.number().describe("All-time visitors to the flat"),
        openTicketCount: z.number().describe("Complaints still OPEN or IN_PROGRESS"),
        ticketCount: z.number().describe("All-time complaints raised"),
        bookingCount: z.number().describe("All-time amenity bookings"),
        outstandingDue: z.number().describe("Unpaid due total for the flat, in rupees"),
        totalPaid: z.number().describe("Settled payment total by this resident, in rupees"),
      })
      .describe("Counts and totals across the sections"),
  })
  .describe("Everything an admin can see about one resident");

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

const ImportSheetInput = z.object({
  fileName: z
    .string()
    .min(1)
    .describe("Original filename — its extension selects the parser (.xlsx or .csv)"),
  fileBase64: z
    .string()
    .min(1)
    .describe(
      `Base64 of the raw file bytes, at most ${Math.floor(
        residentImportService.IMPORT_MAX_FILE_BYTES / (1024 * 1024),
      )} MB decoded`,
    ),
  createMissingFlats: z
    .boolean()
    .default(true)
    .describe(
      "Create towers and flats named in the sheet that do not exist yet; when false, such rows are reported as errors",
    ),
  defaultFlatType: FlatTypeEnum.default("TWO_BHK").describe(
    "Flat type for auto-created flats when the sheet has no Flat Type column",
  ),
});

const ImportRowIssueModel = z
  .object({
    code: z
      .string()
      .describe(
        "Stable machine-readable issue code, e.g. EMAIL_INVALID, DUPLICATE_EMAIL_IN_FILE, ACCOUNT_EXISTS, FLAT_NOT_FOUND, NO_EMAIL",
      ),
    message: z.string().describe("English description of the issue"),
  })
  .describe("One problem found on a row");

const ImportRowModel = z
  .object({
    rowNumber: z.number().describe("1-based row number in the sheet, as the spreadsheet shows it"),
    name: z.string().nullable().describe("Name read from the row, if any"),
    email: z.string().nullable().describe("Normalised email read from the row, if any"),
    phone: z.string().nullable().describe("Normalised 10-digit phone read from the row, if any"),
    towerName: z.string().nullable().describe("Tower name read from the row, if any"),
    flatNumber: z.string().nullable().describe("Flat number read from the row, if any"),
    status: z
      .enum(["READY", "SKIPPED", "ERROR"])
      .describe(
        "READY will be created on commit; SKIPPED is already in the system; ERROR cannot be created",
      ),
    issues: z
      .array(ImportRowIssueModel)
      .describe("Errors for an ERROR row, warnings otherwise (a READY row may still carry these)"),
  })
  .describe("The outcome of one spreadsheet row");

const ImportPreviewModel = z
  .object({
    totalRows: z.number().describe("Data rows found in the sheet, excluding the header"),
    readyCount: z.number().describe("Rows that would be imported"),
    skippedCount: z.number().describe("Rows already in the system"),
    errorCount: z.number().describe("Rows that cannot be imported"),
    towersToCreate: z.array(z.string()).describe("Names of towers that do not exist yet"),
    flatsToCreate: z.number().describe("How many flats would be created"),
    noLoginCount: z
      .number()
      .describe(
        "READY rows with no email — they are added to the register but cannot sign in, because signup is email-only",
      ),
    rows: z.array(ImportRowModel).describe("Per-row outcome, in sheet order"),
  })
  .describe("Dry-run report for a resident import");

const ImportResultModel = z
  .object({
    importedCount: z.number().describe("Residents created"),
    skippedCount: z.number().describe("Rows passed over because they already existed"),
    errorCount: z.number().describe("Rows passed over because they were invalid"),
    towersCreated: z.number().describe("Towers created as part of the import"),
    flatsCreated: z.number().describe("Flats created as part of the import"),
  })
  .describe("What a committed resident import actually wrote");

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const residentRouter = router({
  invite: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("invite"),
        tags: ["Society"],
        summary: "Invite a resident to a flat",
        description:
          "Creates a PendingResidentInvite; when someone signs up (password or Google) with a " +
          "matching email/phone they are auto-linked to the flat as a RESIDENT and the invite is " +
          "claimed. Errors: 400 if neither email nor phone is given, 403 if not an admin, 404 if " +
          "the flat is not in the admin's society, 409 if an account or pending invite already " +
          "exists for the email/phone.",
        protect: true,
      },
    })
    .input(InviteResidentInput)
    .output(InviteModel)
    .mutation(({ ctx, input }) => residentService.inviteResident(ctx.user, input)),

  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Society"],
        summary: "List the society's residents",
        description:
          "Cursor-paginated list of residents in the calling admin's society, filterable by " +
          "tower, flat, and account status, and searchable by name/email/phone. " +
          "Errors: 403 if not an admin.",
        protect: true,
      },
    })
    .input(ListResidentsInput)
    .output(
      z.object({
        items: z.array(ResidentModel).describe("Residents on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => residentService.listResidents(ctx.user, input)),

  detail: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("{userId}"),
        tags: ["Society"],
        summary: "Get everything about one resident",
        description:
          "The full admin view of a single resident: identity and flat, household members, " +
          "vehicles, visitor log, complaints, amenity bookings, maintenance dues and payments, " +
          "plus counts and totals. Each list is capped at the most recent " +
          `${residentDetailService.SECTION_LIMIT} rows; the summary counts are all-time. ` +
          "Note that visitors and dues are FLAT-scoped in the schema, so flatmates share those " +
          "two lists. Errors: 403 if not an admin, 404 if the user is not a resident of the " +
          "admin's society, 412 if the admin has no society.",
        protect: true,
      },
    })
    .input(ResidentIdInput)
    .output(ResidentDetailModel)
    .query(({ ctx, input }) => residentDetailService.getResidentDetail(ctx.user, input)),

  importPreview: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("import/preview"),
        tags: ["Society"],
        summary: "Dry-run a bulk resident import",
        description:
          "Parses an uploaded .xlsx or .csv register (headers: Name, Email, Phone, Tower, Flat " +
          "Number, plus optional Floor and Flat Type — common synonyms are accepted) and reports " +
          "every row without writing anything. Each row comes back READY, SKIPPED (already in " +
          "the system, so re-running a file is safe) or ERROR, with machine-readable issue codes. " +
          "Call this before importCommit and show the report to the admin. " +
          `Errors: 400 if the file cannot be read, is empty, exceeds ${residentImportService.IMPORT_MAX_ROWS} ` +
          "rows, or is missing a required column, 403 if not an admin, 412 if the admin has no society.",
        protect: true,
      },
    })
    .input(ImportSheetInput)
    .output(ImportPreviewModel)
    .mutation(({ ctx, input }) => residentImportService.previewResidentImport(ctx.user, input)),

  importCommit: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("import"),
        tags: ["Society"],
        summary: "Bulk import residents from a spreadsheet",
        description:
          "Re-parses the same file importPreview was given and creates a resident account plus " +
          "flat link for every READY row, in one transaction; SKIPPED and ERROR rows are passed " +
          "over. Imported accounts carry no password and no Google id, so they cannot be logged " +
          "into — the resident claims the account by signing up with the same email, which keeps " +
          "the flat the admin assigned. Rows with only a phone are added to the register but " +
          "cannot be claimed, because signup is email-only. " +
          "Errors: 400 if the file cannot be read or no row is importable, 403 if not an admin, " +
          "412 if the admin has no society.",
        protect: true,
      },
    })
    .input(ImportSheetInput)
    .output(ImportResultModel)
    .mutation(({ ctx, input }) => residentImportService.commitResidentImport(ctx.user, input)),

  updateContact: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("{userId}/contact"),
        tags: ["Society"],
        summary: "Fill in a resident's missing email or phone",
        description:
          "Sets an email and/or phone on a resident who does not have one — chiefly a " +
          "bulk-imported resident, who cannot claim their account until an email exists. " +
          "This is fill-only: a contact that is already set can be changed by the resident " +
          "alone, never by an admin. The email is stored lowercased and stays unverified, so " +
          "the OTP gate still applies when the resident signs up. Errors: 400 if neither field " +
          "is given, 403 if not an admin, 404 if the user is not a resident of the admin's " +
          "society, 409 if the field is already set or the value belongs to another account.",
        protect: true,
      },
    })
    .input(ResidentContactInput)
    .output(ResidentContactModel)
    .mutation(({ ctx, input }) => residentService.updateResidentContact(ctx.user, input)),

  deactivate: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{userId}/deactivate"),
        tags: ["Society"],
        summary: "Deactivate a resident",
        description:
          "Deactivates the resident's account and revokes all their sessions — they can no " +
          "longer log in or refresh. Errors: 403 if not an admin, 404 if the user is not a " +
          "resident of the admin's society.",
        protect: true,
      },
    })
    .input(ResidentIdInput)
    .output(ActiveStateModel)
    .mutation(({ ctx, input }) =>
      residentService.setResidentActive(ctx.user, { userId: input.userId, isActive: false }),
    ),

  reactivate: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{userId}/reactivate"),
        tags: ["Society"],
        summary: "Reactivate a resident",
        description:
          "Reactivates a previously deactivated resident account; they can log in again. " +
          "Errors: 403 if not an admin, 404 if the user is not a resident of the admin's society.",
        protect: true,
      },
    })
    .input(ResidentIdInput)
    .output(ActiveStateModel)
    .mutation(({ ctx, input }) =>
      residentService.setResidentActive(ctx.user, { userId: input.userId, isActive: true }),
    ),
});
