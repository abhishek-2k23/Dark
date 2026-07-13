import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

/**
 * Society polls. Admins create; residents vote — one option per poll unless
 * `allowMultiple`, never twice on the same option, never after the deadline.
 * Votes cannot be changed or withdrawn (MVP).
 */

export interface PollInfo {
  id: string;
  question: string;
  allowMultiple: boolean;
  deadline: string;
  isClosed: boolean;
  createdBy: { id: string; name: string };
  options: { id: string; text: string }[];
  totalVotes: number;
  /** Option ids the calling user has voted for (empty for non-residents). */
  myOptionIds: string[];
  createdAt: string;
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

async function actorResidentProfileId(actor: User): Promise<string | null> {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  return profile?.id ?? null;
}

const pollInclude = {
  createdByAdmin: { select: { id: true, name: true } },
  options: { select: { id: true, text: true } },
  _count: { select: { votes: true } },
} as const;

type PollRow = Awaited<ReturnType<typeof prisma.poll.findMany<{ include: typeof pollInclude }>>>[number];

function toPollInfo(poll: PollRow, myOptionIds: string[]): PollInfo {
  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    deadline: poll.deadline.toISOString(),
    isClosed: poll.deadline < new Date(),
    createdBy: poll.createdByAdmin,
    options: poll.options,
    totalVotes: poll._count.votes,
    myOptionIds,
    createdAt: poll.createdAt.toISOString(),
  };
}

export async function createPoll(
  actor: User,
  input: {
    question: string;
    options: string[];
    allowMultiple?: boolean;
    deadline: string;
  },
): Promise<PollInfo> {
  const societyId = actorSocietyId(actor);
  const deadline = new Date(input.deadline);
  if (deadline <= new Date()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "deadline must be in the future" });
  }

  const poll = await prisma.poll.create({
    data: {
      societyId,
      question: input.question,
      allowMultiple: input.allowMultiple ?? false,
      deadline,
      createdByAdminId: actor.id,
      options: { create: input.options.map((text) => ({ text })) },
    },
    include: pollInclude,
  });

  // TODO(Phase 8): NotificationService — push "new poll" to every resident
  // of the society here.

  return toPollInfo(poll, []);
}

export async function votePoll(
  actor: User,
  input: { pollId: string; optionId: string },
): Promise<PollInfo> {
  const residentProfileId = await actorResidentProfileId(actor);
  if (!residentProfileId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }

  const poll = await prisma.poll.findFirst({
    where: { id: input.pollId, societyId: actorSocietyId(actor) },
    include: { options: { select: { id: true } } },
  });
  if (!poll) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Poll not found" });
  }
  if (poll.deadline < new Date()) {
    throw new TRPCError({ code: "CONFLICT", message: "This poll is closed" });
  }
  if (!poll.options.some((o) => o.id === input.optionId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Option not found in this poll" });
  }

  const existing = await prisma.pollVote.findMany({
    where: { pollId: poll.id, residentId: residentProfileId },
    select: { optionId: true },
  });
  if (existing.some((v) => v.optionId === input.optionId)) {
    throw new TRPCError({ code: "CONFLICT", message: "You already voted for this option" });
  }
  if (!poll.allowMultiple && existing.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You already voted in this poll — it allows one choice",
    });
  }

  await prisma.pollVote.create({
    data: { pollId: poll.id, optionId: input.optionId, residentId: residentProfileId },
  });

  const updated = await prisma.poll.findUniqueOrThrow({
    where: { id: poll.id },
    include: pollInclude,
  });
  return toPollInfo(updated, [...existing.map((v) => v.optionId), input.optionId]);
}

export interface PollResults {
  pollId: string;
  question: string;
  isClosed: boolean;
  totalVotes: number;
  options: { id: string; text: string; votes: number; percentage: number }[];
}

export async function pollResults(
  actor: User,
  input: { pollId: string },
): Promise<PollResults> {
  const poll = await prisma.poll.findFirst({
    where: { id: input.pollId, societyId: actorSocietyId(actor) },
    include: {
      options: { select: { id: true, text: true, _count: { select: { votes: true } } } },
      _count: { select: { votes: true } },
    },
  });
  if (!poll) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Poll not found" });
  }

  const totalVotes = poll._count.votes;
  return {
    pollId: poll.id,
    question: poll.question,
    isClosed: poll.deadline < new Date(),
    totalVotes,
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      votes: option._count.votes,
      percentage: totalVotes === 0 ? 0 : Math.round((option._count.votes / totalVotes) * 1000) / 10,
    })),
  };
}

export async function listPolls(
  actor: User,
  input: { state: "ACTIVE" | "CLOSED" | "ALL"; cursor?: string; limit: number },
): Promise<{ items: PollInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);
  const now = new Date();

  const polls = await prisma.poll.findMany({
    where: {
      societyId,
      ...(input.state === "ACTIVE" ? { deadline: { gte: now } } : {}),
      ...(input.state === "CLOSED" ? { deadline: { lt: now } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: pollInclude,
  });

  const residentProfileId = await actorResidentProfileId(actor);
  const myVotes = residentProfileId
    ? await prisma.pollVote.findMany({
        where: { residentId: residentProfileId, pollId: { in: polls.map((p) => p.id) } },
        select: { pollId: true, optionId: true },
      })
    : [];

  const hasMore = polls.length > input.limit;
  const items = (hasMore ? polls.slice(0, input.limit) : polls).map((poll) =>
    toPollInfo(
      poll,
      myVotes.filter((v) => v.pollId === poll.id).map((v) => v.optionId),
    ),
  );
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
