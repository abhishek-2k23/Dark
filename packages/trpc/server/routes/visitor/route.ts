import { visitorService, preApprovalService } from "@repo/services";

import { phoneSchema, z, zodUndefinedModel } from "../../schema";
import { guardProcedure, protectedProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const visitorPath = generatePath("v1/visitors");
const preApprovalPath = generatePath("v1/pre-approvals");
const gatePath = generatePath("v1/gate");

/**
 * Visitor state machine (documented on every endpoint that moves it):
 *
 *   PENDING → APPROVED | DENIED | EXPIRED
 *   APPROVED → entryTime set → exitTime set
 */
const STATE_MACHINE =
  "State machine: a visitor starts PENDING; the flat's resident moves it to APPROVED or " +
  "DENIED; PENDING requests older than the server's timeout (default 15 min) are flipped to " +
  "EXPIRED automatically. Only APPROVED visitors can be marked as entered, and only entered " +
  "visitors as exited.";

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const VisitorPurposeEnum = z
  .enum(["GUEST", "DELIVERY", "CAB", "SERVICE_STAFF", "OTHER"])
  .describe("Reason for the visit");

const VisitorStatusEnum = z
  .enum(["PENDING", "APPROVED", "DENIED", "EXPIRED"])
  .describe("Approval status of the visitor request");

const PreApprovalStatusEnum = z
  .enum(["ACTIVE", "USED", "EXPIRED", "CANCELLED"])
  .describe("Lifecycle status of the pre-approval");

const UserRefModel = z.object({
  id: z.string().describe("User id"),
  name: z.string().describe("Full name"),
});

const VisitorModel = z
  .object({
    id: z.string().describe("Visitor id"),
    name: z.string().describe("Visitor's full name"),
    phone: z.string().describe("Visitor phone number"),
    photoUrl: z.string().nullable().describe("Photo URL taken at the gate, if any"),
    purpose: VisitorPurposeEnum,
    vehicleNumber: z.string().nullable().describe("Vehicle registration number, if any"),
    flatId: z.string().describe("Id of the flat being visited"),
    flatNumber: z.string().describe("Number of the flat being visited"),
    towerName: z.string().describe("Tower of the flat being visited"),
    status: VisitorStatusEnum,
    registeredByGuard: UserRefModel.describe("Guard who registered the visitor"),
    actionedByResident: UserRefModel.nullable().describe(
      "Resident who approved or denied the request; null while PENDING/EXPIRED",
    ),
    entryTime: z.string().nullable().describe("ISO time the visitor entered, if marked"),
    exitTime: z.string().nullable().describe("ISO time the visitor exited, if marked"),
    createdAt: z.string().describe("ISO time the request was registered"),
  })
  .describe("A visitor request at the gate");

const PreApprovalModel = z
  .object({
    id: z.string().describe("Pre-approval id"),
    guestName: z.string().describe("Expected guest's name"),
    guestPhone: z.string().nullable().describe("Expected guest's phone"),
    validFrom: z.string().describe("ISO start of the validity window"),
    validTo: z.string().describe("ISO end of the validity window"),
    vehicleNumber: z.string().nullable().describe("Expected vehicle number, if any"),
    qrCode: z.string().describe("Opaque token the guest presents (rendered as a QR on mobile)"),
    status: PreApprovalStatusEnum,
    flatId: z.string().describe("Flat the guest is pre-approved for"),
    createdAt: z.string().describe("ISO time the pre-approval was created"),
  })
  .describe("A resident-issued guest pre-approval");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const RegisterVisitorInput = z.object({
  name: z.string().min(1).describe("Visitor's full name"),
  phone: phoneSchema.describe("Visitor's 10-digit phone number"),
  purpose: VisitorPurposeEnum,
  flatId: z.string().describe("Target flat the visitor is heading to"),
  photoUrl: z.url().describe("Photo URL of the visitor (Cloudinary, Phase 9)").optional(),
  vehicleNumber: z.string().describe("Vehicle registration number, if applicable").optional(),
});

const VisitorIdInput = z.object({
  visitorId: z.string().describe("Id of the visitor request"),
});

const HistoryInput = z.object({
  period: z
    .enum(["TODAY", "WEEK", "MONTH", "ALL"])
    .default("ALL")
    .describe("Time window: today, last 7 days, last 30 days, or everything"),
  status: VisitorStatusEnum.describe("Only requests with this status").optional(),
  flatId: z
    .string()
    .describe("Only this flat (guards/admins only — residents always see their own flat)")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last visitor from the previous page").optional(),
});

const CreatePreApprovalInput = z.object({
  guestName: z.string().min(1).describe("Expected guest's full name"),
  guestPhone: phoneSchema.describe("Expected guest's 10-digit phone"),
  validFrom: z.iso.datetime().describe("ISO start of the validity window"),
  validTo: z.iso.datetime().describe("ISO end of the validity window"),
  vehicleNumber: z.string().describe("Expected vehicle number, if known").optional(),
});

const VerifyPreApprovalInput = z.object({
  qrCode: z.string().min(1).describe("QR token presented by the guest at the gate"),
});

const PreApprovalIdInput = z.object({
  preApprovalId: z.string().describe("Id of the pre-approval"),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const visitorRouter = router({
  register: guardProcedure
    .meta({
      openapi: {
        method: "POST",
        path: visitorPath("register"),
        tags: ["Visitors"],
        summary: "Register a new visitor at the gate",
        description:
          "Used by a security guard to log a new visitor (guest, delivery, cab, or service " +
          "staff) heading to a flat; the request starts PENDING and the flat's resident is " +
          `asked to approve it. ${STATE_MACHINE} ` +
          "Errors: 403 if not a guard, 404 if the flat is not in the guard's society.",
        protect: true,
      },
    })
    .input(RegisterVisitorInput)
    .output(VisitorModel)
    .mutation(({ ctx, input }) => visitorService.registerVisitor(ctx.user, input)),

  approve: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: visitorPath("{visitorId}/approve"),
        tags: ["Visitors"],
        summary: "Approve a pending visitor",
        description:
          `Resident approves a PENDING visitor heading to their flat. ${STATE_MACHINE} ` +
          "Errors: 403 if not a resident, 404 if the visitor is not for the caller's flat, " +
          "409 if the request is no longer PENDING (already actioned or expired).",
        protect: true,
      },
    })
    .input(VisitorIdInput)
    .output(VisitorModel)
    .mutation(({ ctx, input }) =>
      visitorService.decideVisitor(ctx.user, { visitorId: input.visitorId, decision: "APPROVED" }),
    ),

  deny: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: visitorPath("{visitorId}/deny"),
        tags: ["Visitors"],
        summary: "Deny a pending visitor",
        description:
          `Resident denies a PENDING visitor heading to their flat. ${STATE_MACHINE} ` +
          "Errors: 403 if not a resident, 404 if the visitor is not for the caller's flat, " +
          "409 if the request is no longer PENDING (already actioned or expired).",
        protect: true,
      },
    })
    .input(VisitorIdInput)
    .output(VisitorModel)
    .mutation(({ ctx, input }) =>
      visitorService.decideVisitor(ctx.user, { visitorId: input.visitorId, decision: "DENIED" }),
    ),

  markEntry: guardProcedure
    .meta({
      openapi: {
        method: "POST",
        path: visitorPath("{visitorId}/entry"),
        tags: ["Visitors"],
        summary: "Mark a visitor's physical entry",
        description:
          `Guard records that an APPROVED visitor physically entered. ${STATE_MACHINE} ` +
          "Errors: 403 if not a guard, 404 if the visitor is not in the guard's society, " +
          "409 if the visitor is not APPROVED or entry is already marked.",
        protect: true,
      },
    })
    .input(VisitorIdInput)
    .output(VisitorModel)
    .mutation(({ ctx, input }) => visitorService.markEntry(ctx.user, input)),

  markExit: guardProcedure
    .meta({
      openapi: {
        method: "POST",
        path: visitorPath("{visitorId}/exit"),
        tags: ["Visitors"],
        summary: "Mark a visitor's exit",
        description:
          `Guard records that a visitor left the premises. ${STATE_MACHINE} ` +
          "Errors: 403 if not a guard, 404 if the visitor is not in the guard's society, " +
          "409 if entry was never marked or exit is already marked.",
        protect: true,
      },
    })
    .input(VisitorIdInput)
    .output(VisitorModel)
    .mutation(({ ctx, input }) => visitorService.markExit(ctx.user, input)),

  listPending: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: visitorPath("pending"),
        tags: ["Visitors"],
        summary: "List the caller's pending visitor approvals",
        description:
          "The resident's live approval queue: every PENDING visitor heading to their flat, " +
          "newest first. Errors: 403 if not a resident, 412 if the account has no resident profile.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(z.array(VisitorModel))
    .query(({ ctx }) => visitorService.listPending(ctx.user)),

  history: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: visitorPath(""),
        tags: ["Visitors"],
        summary: "Visitor history (role-aware scope)",
        description:
          "Cursor-paginated visitor history filterable by period and status. Residents see " +
          "their own flat only; guards and admins see their whole society and may filter by " +
          "flat. Errors: 401 if not authenticated, 412 if the account is not linked to a " +
          "society/flat.",
        protect: true,
      },
    })
    .input(HistoryInput)
    .output(
      z.object({
        items: z.array(VisitorModel).describe("Visitor requests on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => visitorService.history(ctx.user, input)),

  // Registered after the static /pending and /history paths so the REST
  // matcher never swallows them as a {visitorId}.
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: visitorPath("{visitorId}"),
        tags: ["Visitors"],
        summary: "Get one visitor request",
        description:
          "Role-aware fetch: residents can read visitors of their own flat only; guards and " +
          "admins any visitor in their society. Errors: 401 if not authenticated, 404 if the " +
          "visitor is not accessible to the caller.",
        protect: true,
      },
    })
    .input(VisitorIdInput)
    .output(VisitorModel)
    .query(({ ctx, input }) => visitorService.getVisitor(ctx.user, input)),
});

const GateFlatModel = z
  .object({
    id: z.string().describe("Flat id"),
    flatNumber: z.string().describe("Flat number"),
    towerName: z.string().describe("Tower name"),
    floor: z.number().describe("Floor the flat is on"),
    residentNames: z.array(z.string()).describe("Names of residents linked to the flat"),
  })
  .describe("A flat as seen from the gate (guard/admin lookup)");

const SearchFlatsInput = z.object({
  search: z
    .string()
    .describe("Match against flat number, tower name, or a resident's name")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20).describe("Max results (max 50)"),
});

/** Gate-side flat lookup so guards can find the target flat before registering. */
export const gateRouter = router({
  searchFlats: guardProcedure
    .meta({
      openapi: {
        method: "GET",
        path: gatePath("flats"),
        tags: ["Visitors"],
        summary: "Search flats at the gate",
        description:
          "Society-scoped flat lookup for a guard registering a visitor: matches the term " +
          "against flat number, tower name, or a resident's name. Errors: 403 if not a guard, " +
          "412 if the account is not linked to a society.",
        protect: true,
      },
    })
    .input(SearchFlatsInput)
    .output(z.array(GateFlatModel))
    .query(({ ctx, input }) => visitorService.searchFlats(ctx.user, input)),
});

export const guestPreApprovalRouter = router({
  create: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: preApprovalPath(""),
        tags: ["Visitors"],
        summary: "Pre-approve an expected guest",
        description:
          "Resident opens a validity window for an expected guest and receives a QR token to " +
          "share with them; when the guard verifies it at the gate an already-APPROVED visitor " +
          "is created. Errors: 400 if the window is invalid or entirely in the past, 403 if not " +
          "a resident, 412 if the account has no resident profile.",
        protect: true,
      },
    })
    .input(CreatePreApprovalInput)
    .output(PreApprovalModel)
    .mutation(({ ctx, input }) => preApprovalService.createPreApproval(ctx.user, input)),

  list: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: preApprovalPath(""),
        tags: ["Visitors"],
        summary: "List the caller's guest pre-approvals",
        description:
          "The resident's own flat's pre-approvals, newest first, optionally filtered by " +
          "status. Errors: 403 if not a resident, 412 if the account has no resident profile.",
        protect: true,
      },
    })
    .input(
      z.object({
        status: PreApprovalStatusEnum.describe("Only this status").optional(),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Page size (max 100)"),
        cursor: z
          .string()
          .describe("Id of the last pre-approval from the previous page")
          .optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(PreApprovalModel).describe("Pre-approvals on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when this is the last page"),
      }),
    )
    .query(({ ctx, input }) =>
      preApprovalService.listMyPreApprovals(ctx.user, input),
    ),

  verify: guardProcedure
    .meta({
      openapi: {
        method: "POST",
        path: preApprovalPath("verify"),
        tags: ["Visitors"],
        summary: "Verify a guest's pre-approval QR at the gate",
        description:
          "Guard verifies the presented QR token. If it is ACTIVE and inside its validity " +
          "window, the pre-approval is marked USED and an already-APPROVED visitor (purpose " +
          "GUEST) is created — mark entry/exit on that visitor as usual. Errors: 403 if not a " +
          "guard, 404 if the token is unknown or belongs to another society, 409 if the " +
          "pre-approval is USED/CANCELLED/EXPIRED or outside its window.",
        protect: true,
      },
    })
    .input(VerifyPreApprovalInput)
    .output(
      z.object({
        preApproval: PreApprovalModel,
        visitor: VisitorModel.describe("The auto-created, already-APPROVED visitor"),
      }),
    )
    .mutation(({ ctx, input }) => preApprovalService.verifyPreApproval(ctx.user, input)),

  cancel: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: preApprovalPath("{preApprovalId}/cancel"),
        tags: ["Visitors"],
        summary: "Cancel an upcoming pre-approval",
        description:
          "Resident cancels one of their own ACTIVE pre-approvals; the QR token stops working. " +
          "Errors: 403 if not a resident, 404 if the pre-approval does not belong to the " +
          "caller, 409 if it is not ACTIVE (already used, expired, or cancelled).",
        protect: true,
      },
    })
    .input(PreApprovalIdInput)
    .output(PreApprovalModel)
    .mutation(({ ctx, input }) => preApprovalService.cancelPreApproval(ctx.user, input)),
});
