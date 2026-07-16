import { helpdeskService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, protectedProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/tickets");

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const TicketCategoryEnum = z
  .enum(["PLUMBING", "ELECTRICAL", "HOUSEKEEPING", "SECURITY", "OTHER"])
  .describe("Ticket category");

const TicketPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Ticket priority");

const TicketStatusEnum = z
  .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  .describe("Ticket workflow status");

const UserRefModel = z.object({
  id: z.string().describe("User id"),
  name: z.string().describe("Full name"),
});

const TicketModel = z
  .object({
    id: z.string().describe("Ticket id"),
    referenceCode: z
      .string()
      .describe("Human-readable handle, e.g. TKT-4B7Q2M — quote this when following up"),
    category: TicketCategoryEnum,
    title: z.string().describe("Short summary of the issue"),
    description: z.string().describe("Full description of the issue"),
    photoUrls: z.array(z.string()).describe("Photo URLs attached to the ticket"),
    priority: TicketPriorityEnum,
    status: TicketStatusEnum,
    flatId: z.string().describe("Flat the ticket was raised for"),
    flatNumber: z.string().describe("Flat number"),
    towerName: z.string().describe("Tower name"),
    raisedBy: UserRefModel.describe("Resident who raised the ticket"),
    assignedTo: UserRefModel.nullable().describe("Staff member working the ticket, if assigned"),
    commentCount: z.number().describe("Number of comments on the ticket"),
    createdAt: z.string().describe("ISO creation time"),
    updatedAt: z.string().describe("ISO last-update time"),
  })
  .describe("A helpdesk ticket");

const CommentModel = z
  .object({
    id: z.string().describe("Comment id"),
    author: UserRefModel.describe("Who wrote the comment"),
    message: z.string().describe("Comment text"),
    photoUrls: z.array(z.string()).describe("Photo URLs attached to the comment"),
    createdAt: z.string().describe("ISO creation time"),
  })
  .describe("A comment on a helpdesk ticket");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const CreateTicketInput = z.object({
  category: TicketCategoryEnum,
  title: z.string().min(1).describe("Short summary of the issue"),
  description: z.string().min(1).describe("Full description of the issue"),
  photoUrls: z.array(z.url()).max(5).describe("Photo URLs (Cloudinary, Phase 9)").optional(),
  priority: TicketPriorityEnum.describe("Defaults to MEDIUM").optional(),
});

const ListTicketsInput = z.object({
  status: TicketStatusEnum.describe("Only tickets with this status").optional(),
  category: TicketCategoryEnum.describe("Only tickets in this category").optional(),
  priority: TicketPriorityEnum.describe("Only tickets with this priority").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last ticket from the previous page").optional(),
});

const TicketIdInput = z.object({
  ticketId: z.string().describe("Id of the ticket"),
});

const UpdateStatusInput = z.object({
  ticketId: z.string().describe("Id of the ticket"),
  status: TicketStatusEnum,
});

const AssignInput = z.object({
  ticketId: z.string().describe("Id of the ticket"),
  assigneeId: z.string().describe("User id of the guard/admin to assign"),
});

const AddCommentInput = z.object({
  ticketId: z.string().describe("Id of the ticket"),
  message: z.string().min(1).describe("Comment text"),
  photoUrls: z
    .array(z.url())
    .max(5)
    .describe("Photo URLs (Cloudinary TICKET kind) — e.g. proof the issue is fixed")
    .optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const ticketRouter = router({
  create: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Helpdesk"],
        summary: "Raise a helpdesk ticket",
        description:
          "Resident raises a ticket for their own flat; it starts OPEN with MEDIUM priority " +
          "unless specified. Errors: 403 if not a resident, 412 if the account has no " +
          "resident profile.",
        protect: true,
      },
    })
    .input(CreateTicketInput)
    .output(TicketModel)
    .mutation(({ ctx, input }) => helpdeskService.createTicket(ctx.user, input)),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Helpdesk"],
        summary: "List tickets (role-aware scope)",
        description:
          "Cursor-paginated tickets filterable by status/category/priority. Residents see " +
          "their own tickets; admins see the whole society's. Errors: 401 if not " +
          "authenticated, 403 for guards.",
        protect: true,
      },
    })
    .input(ListTicketsInput)
    .output(
      z.object({
        items: z.array(TicketModel).describe("Tickets on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => helpdeskService.listTickets(ctx.user, input)),

  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("{ticketId}"),
        tags: ["Helpdesk"],
        summary: "Get a ticket with its comments",
        description:
          "Full ticket detail including the comment thread. Accessible to the raising " +
          "resident, the society's admins, and the assignee. Errors: 401 if not " +
          "authenticated, 404 if the ticket is not accessible to the caller.",
        protect: true,
      },
    })
    .input(TicketIdInput)
    .output(TicketModel.extend({ comments: z.array(CommentModel).describe("Comment thread") }))
    .query(({ ctx, input }) => helpdeskService.getTicket(ctx.user, input)),

  updateStatus: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{ticketId}/status"),
        tags: ["Helpdesk"],
        summary: "Change a ticket's status",
        description:
          "Moves the ticket through OPEN → IN_PROGRESS → RESOLVED → CLOSED (any transition " +
          "allowed). Only the society's admins or the ticket's assignee may do this. " +
          "Errors: 401 if not authenticated, 403 if the caller is neither admin nor " +
          "assignee, 404 if the ticket is not accessible.",
        protect: true,
      },
    })
    .input(UpdateStatusInput)
    .output(TicketModel)
    .mutation(({ ctx, input }) => helpdeskService.updateTicketStatus(ctx.user, input)),

  assign: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{ticketId}/assign"),
        tags: ["Helpdesk"],
        summary: "Assign a ticket to a staff member",
        description:
          "Admin assigns the ticket to an active guard or admin of the same society. " +
          "Errors: 403 if not an admin, 404 if the ticket is not accessible or the " +
          "assignee is not an active guard/admin of the society.",
        protect: true,
      },
    })
    .input(AssignInput)
    .output(TicketModel)
    .mutation(({ ctx, input }) => helpdeskService.assignTicket(ctx.user, input)),

  addComment: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{ticketId}/comments"),
        tags: ["Helpdesk"],
        summary: "Comment on a ticket",
        description:
          "Adds a comment to the ticket's thread. Accessible to the raising resident, the " +
          "society's admins, and the assignee. Errors: 401 if not authenticated, 404 if " +
          "the ticket is not accessible to the caller.",
        protect: true,
      },
    })
    .input(AddCommentInput)
    .output(CommentModel)
    .mutation(({ ctx, input }) => helpdeskService.addComment(ctx.user, input)),
});
