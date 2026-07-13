import { residentService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

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
  email: z.email().optional().describe("Invitee email (this or phone required)"),
  phone: z.string().min(8).optional().describe("Invitee phone (this or email required)"),
});

const ListResidentsInput = z.object({
  towerId: z.string().optional().describe("Only residents of this tower"),
  flatId: z.string().optional().describe("Only residents of this flat"),
  status: z
    .enum(["ACTIVE", "INACTIVE", "ALL"])
    .default("ALL")
    .describe("Filter by account status"),
  search: z.string().optional().describe("Match against name, email, or phone"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().optional().describe("Id of the last resident from the previous page"),
});

const ResidentIdInput = z.object({
  userId: z.string().describe("User id of the resident"),
});

const ActiveStateModel = z.object({
  id: z.string().describe("User id"),
  isActive: z.boolean().describe("Account active state after the change"),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const residentRouter = router({
  invite: adminProcedure
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

  deactivate: adminProcedure
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

  reactivate: adminProcedure
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
