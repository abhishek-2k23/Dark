import { joinRequestService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/join-requests");

const JoinRequestStatusEnum = z
  .enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"])
  .describe(
    "Request lifecycle. REJECTED is permanent for that society (only an admin " +
      "invite can follow); EXPIRED means the admin never answered within the TTL " +
      "and the user may ask again after the cooldown",
  );

const SubmitInput = z.object({
  adminEmail: z
    .email()
    .describe("Email of the target society's admin — how the society is identified"),
});

const MyJoinRequestModel = z
  .object({
    id: z.string().describe("Request id"),
    societyName: z.string().describe("Society the request targets"),
    status: JoinRequestStatusEnum,
    expiresAt: z.string().describe("ISO time a PENDING request lapses"),
    canRequestAgainAt: z
      .string()
      .nullable()
      .describe("When an EXPIRED request stops blocking a new one; null otherwise"),
    createdAt: z.string().describe("ISO time the request was made"),
  })
  .describe("The caller's most recent join request");

const PendingJoinRequestModel = z
  .object({
    id: z.string().describe("Request id"),
    userName: z.string().describe("Who is asking"),
    userEmail: z.string().nullable().describe("Their email, if any"),
    userPhone: z.string().nullable().describe("Their phone, if any"),
    userAvatarUrl: z.string().nullable().describe("Their profile photo, if set"),
    expiresAt: z.string().describe("ISO time the request lapses"),
    createdAt: z.string().describe("ISO time the request was made"),
  })
  .describe("A live join request awaiting this admin's decision");

const ListInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size"),
  cursor: z.string().describe("Id of the last request from the previous page").optional(),
});

const DecideInput = z.object({
  requestId: z.string().describe("Id of the request to decide on"),
  approve: z.boolean().describe("true admits the user; false declines them"),
  flatId: z
    .string()
    .describe("Required when approving — the flat the new resident belongs to")
    .optional(),
});

export const joinRequestRouter = router({
  submit: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Society"],
        summary: "Ask to join a society by naming its admin's email",
        description:
          "For signed-in users with no society. ALWAYS returns submitted:true whether or not " +
          "the email matched an admin — this endpoint must not be usable to probe which " +
          "emails belong to admins. The caller's own history still errors honestly: 409 if " +
          "they already have a pending request, 403 if that society rejected them before " +
          "(permanent — only an admin invite can follow), 429 during the re-request cooldown " +
          "after an expired request, 412 if they already belong to a society. Requests lapse " +
          "after JOIN_REQUEST_TTL_MIN (default 120).",
        protect: true,
      },
    })
    .input(SubmitInput)
    .output(z.object({ submitted: z.literal(true) }))
    .mutation(({ ctx, input }) => joinRequestService.submitJoinRequest(ctx.user, input)),

  mine: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("mine"),
        tags: ["Society"],
        summary: "The caller's most recent join request, if any",
        description:
          "Drives the no-society screen: shows a pending countdown, an expired request's " +
          "re-request time, or a rejection. Null when the caller has never asked. Showing a " +
          "user their own request leaks nothing, so this is exact where submit is vague.",
        protect: true,
      },
    })
    .input(z.void())
    .output(MyJoinRequestModel.nullable())
    .query(({ ctx }) => joinRequestService.myJoinRequest(ctx.user)),

  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Society"],
        summary: "List live join requests for the admin's society",
        description:
          "Cursor-paginated, oldest first. Requests past their TTL never appear, even before " +
          "the sweep marks them EXPIRED. Errors: 403 if not an admin, 412 if the account has " +
          "no society.",
        protect: true,
      },
    })
    .input(ListInput)
    .output(
      z.object({
        items: z.array(PendingJoinRequestModel).describe("Requests on this page"),
        nextCursor: z.string().nullable().describe("Cursor for the next page, or null"),
      }),
    )
    .query(({ ctx, input }) => joinRequestService.listJoinRequests(ctx.user, input)),

  decide: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("decide"),
        tags: ["Society"],
        summary: "Approve or reject a join request",
        description:
          "Approving requires flatId — a resident without a flat can't use visitors, dues, or " +
          "tickets — and attaches the user to the society plus creates their resident profile " +
          "in one transaction; their next session refresh sees the society. Rejecting is " +
          "permanent for that society. Either way the requester is notified. Errors: 400 " +
          "approving without a flat, 403 if not an admin, 404 for a request or flat outside " +
          "the admin's society, 409 if already decided/expired or the user joined elsewhere.",
        protect: true,
      },
    })
    .input(DecideInput)
    .output(z.object({ status: JoinRequestStatusEnum }))
    .mutation(({ ctx, input }) => joinRequestService.decideJoinRequest(ctx.user, input)),
});
