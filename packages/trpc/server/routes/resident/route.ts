import { residentImportService, residentService } from "@repo/services";

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
