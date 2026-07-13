import { pollService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, protectedProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/polls");

const PollOptionModel = z.object({
  id: z.string().describe("Option id"),
  text: z.string().describe("Option text"),
});

const PollModel = z
  .object({
    id: z.string().describe("Poll id"),
    question: z.string().describe("The poll question"),
    allowMultiple: z.boolean().describe("Whether a resident may vote for multiple options"),
    deadline: z.string().describe("ISO time voting closes"),
    isClosed: z.boolean().describe("Whether the deadline has passed"),
    createdBy: z
      .object({
        id: z.string().describe("User id"),
        name: z.string().describe("Full name"),
      })
      .describe("Admin who created the poll"),
    options: z.array(PollOptionModel).describe("The votable options"),
    totalVotes: z.number().describe("Total votes cast so far"),
    myOptionIds: z
      .array(z.string())
      .describe("Option ids the caller has voted for (empty for non-residents)"),
    createdAt: z.string().describe("ISO creation time"),
  })
  .describe("A society poll");

const PollResultsModel = z
  .object({
    pollId: z.string().describe("Poll id"),
    question: z.string().describe("The poll question"),
    isClosed: z.boolean().describe("Whether the deadline has passed"),
    totalVotes: z.number().describe("Total votes cast"),
    options: z
      .array(
        PollOptionModel.extend({
          votes: z.number().describe("Votes for this option"),
          percentage: z.number().describe("Share of total votes, 0–100 (one decimal)"),
        }),
      )
      .describe("Per-option tallies"),
  })
  .describe("Aggregated poll results");

const CreatePollInput = z.object({
  question: z.string().min(1).describe("The poll question"),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(10)
    .describe("Votable options (2–10)"),
  allowMultiple: z
    .boolean()
    .optional()
    .describe("Allow voting for multiple options (default false)"),
  deadline: z.iso.datetime().describe("ISO time voting closes; must be in the future"),
});

const VoteInput = z.object({
  pollId: z.string().describe("Id of the poll"),
  optionId: z.string().describe("Id of the option to vote for"),
});

const PollIdInput = z.object({
  pollId: z.string().describe("Id of the poll"),
});

const ListPollsInput = z.object({
  state: z
    .enum(["ACTIVE", "CLOSED", "ALL"])
    .default("ALL")
    .describe("Filter by whether the deadline has passed"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().optional().describe("Id of the last poll from the previous page"),
});

export const pollRouter = router({
  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Polls"],
        summary: "Create a poll",
        description:
          "Admin creates a poll for their society with 2–10 options and a future deadline. " +
          "Errors: 400 if the deadline is in the past, 403 if not an admin.",
        protect: true,
      },
    })
    .input(CreatePollInput)
    .output(PollModel)
    .mutation(({ ctx, input }) => pollService.createPoll(ctx.user, input)),

  vote: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("{pollId}/vote"),
        tags: ["Polls"],
        summary: "Vote in a poll",
        description:
          "Resident casts a vote. One option per poll unless allowMultiple; the same option " +
          "can never be voted twice; votes cannot be changed. Errors: 403 if not a " +
          "resident, 404 if the poll/option is not in the caller's society, 409 if the " +
          "poll is closed or the vote violates the single-vote rule.",
        protect: true,
      },
    })
    .input(VoteInput)
    .output(PollModel)
    .mutation(({ ctx, input }) => pollService.votePoll(ctx.user, input)),

  results: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("{pollId}/results"),
        tags: ["Polls"],
        summary: "Get aggregated poll results",
        description:
          "Per-option vote counts and percentages. Errors: 401 if not authenticated, " +
          "404 if the poll is not in the caller's society.",
        protect: true,
      },
    })
    .input(PollIdInput)
    .output(PollResultsModel)
    .query(({ ctx, input }) => pollService.pollResults(ctx.user, input)),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Polls"],
        summary: "List polls (active vs closed)",
        description:
          "Cursor-paginated polls of the caller's society, newest first, filterable by " +
          "ACTIVE/CLOSED. myOptionIds shows the caller's own votes. Errors: 401 if not " +
          "authenticated, 412 if the account is not linked to a society.",
        protect: true,
      },
    })
    .input(ListPollsInput)
    .output(
      z.object({
        items: z.array(PollModel).describe("Polls on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => pollService.listPolls(ctx.user, input)),
});
