import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@repo/database";

import { assertCloudinaryUrls } from "@repo/cloudinary";
import { logger } from "@repo/logger";
import { sendTicketRaisedEmail } from "@repo/mailer";

import { notifyUser } from "../notification/notification.service";

/**
 * Helpdesk tickets. Residents raise tickets for their own flat; admins see
 * the whole society; the assignee (a guard or admin) can work the ticket.
 * Access matrix per operation lives in each function.
 */

const ticketInclude = {
  flat: { include: { tower: { select: { name: true, societyId: true } } } },
  resident: { include: { user: { select: { id: true, name: true } } } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.HelpdeskTicketInclude;

type TicketRow = Prisma.HelpdeskTicketGetPayload<{ include: typeof ticketInclude }>;

export interface TicketInfo {
  id: string;
  referenceCode: string;
  category: TicketCategory;
  title: string;
  description: string;
  photoUrls: string[];
  priority: TicketPriority;
  status: TicketStatus;
  flatId: string;
  flatNumber: string;
  towerName: string;
  raisedBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCommentInfo {
  id: string;
  author: { id: string; name: string };
  message: string;
  photoUrls: string[];
  createdAt: string;
}

function toTicketInfo(ticket: TicketRow): TicketInfo {
  return {
    id: ticket.id,
    referenceCode: ticket.referenceCode,
    category: ticket.category,
    title: ticket.title,
    description: ticket.description,
    photoUrls: ticket.photoUrls,
    priority: ticket.priority,
    status: ticket.status,
    flatId: ticket.flatId,
    flatNumber: ticket.flat.flatNumber,
    towerName: ticket.flat.tower.name,
    raisedBy: ticket.resident.user,
    assignedTo: ticket.assignedTo,
    commentCount: ticket._count.comments,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

async function actorResidentProfile(actor: User) {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true, flatId: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile;
}

/**
 * Characters a person can read off a screen and type back without ambiguity:
 * Crockford-style, with I/L/O/U removed so nothing collides with 1/0 or gets
 * misheard on a phone call to the office.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateReferenceCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `TKT-${out}`;
}

export async function createTicket(
  actor: User,
  input: {
    category: TicketCategory;
    title: string;
    description: string;
    photoUrls?: string[];
    priority?: TicketPriority;
  },
): Promise<TicketInfo> {
  assertCloudinaryUrls(input.photoUrls);
  const profile = await actorResidentProfile(actor);

  // 32^6 codes makes a collision vanishingly unlikely, but "unlikely" is not
  // "impossible" and the column is unique — so retry rather than 500 on the
  // unlucky ticket.
  let ticket: TicketRow | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      ticket = await prisma.helpdeskTicket.create({
        data: {
          referenceCode: generateReferenceCode(),
          residentId: profile.id,
          flatId: profile.flatId,
          category: input.category,
          title: input.title,
          description: input.description,
          photoUrls: input.photoUrls ?? [],
          priority: input.priority ?? "MEDIUM",
        },
        include: ticketInclude,
      });
      break;
    } catch (err) {
      // Matched on shape rather than `instanceof`: pnpm can resolve @prisma/client
      // more than once, and an instanceof across two copies silently fails.
      const e = err as { code?: string; meta?: { target?: unknown } };
      const isCodeCollision =
        e?.code === "P2002" && String(e.meta?.target ?? "").includes("referenceCode");
      if (!isCodeCollision) throw err;
    }
  }
  if (!ticket) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not allocate a ticket reference — please try again",
    });
  }

  // Best-effort: the ticket exists and is visible in the app, so a mail
  // failure must not fail the raise.
  if (actor.email) {
    void sendTicketRaisedEmail({
      to: actor.email,
      referenceCode: ticket.referenceCode,
      title: ticket.title,
      category: ticket.category,
    }).catch((err: unknown) => {
      logger.error("Failed to email ticket reference", {
        ticketId: ticket!.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return toTicketInfo(ticket);
}

/** Residents list their own tickets; admins list the society's (guards have no list). */
export async function listTickets(
  actor: User,
  input: {
    status?: TicketStatus;
    category?: TicketCategory;
    priority?: TicketPriority;
    cursor?: string;
    limit: number;
  },
): Promise<{ items: TicketInfo[]; nextCursor: string | null }> {
  let scope: Prisma.HelpdeskTicketWhereInput;
  if (actor.role === "RESIDENT") {
    const profile = await actorResidentProfile(actor);
    scope = { residentId: profile.id };
  } else if (actor.role === "ADMIN") {
    if (!actor.societyId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Your account is not linked to a society",
      });
    }
    scope = { flat: { tower: { societyId: actor.societyId } } };
  } else {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only residents and admins can list tickets",
    });
  }

  const tickets = await prisma.helpdeskTicket.findMany({
    where: {
      ...scope,
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: ticketInclude,
  });

  const hasMore = tickets.length > input.limit;
  const items = (hasMore ? tickets.slice(0, input.limit) : tickets).map(toTicketInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Fetches a ticket the actor may access: its raising resident, any admin of
 * the ticket's society, or the assignee. Throws NOT_FOUND otherwise (no
 * existence leak).
 */
async function requireAccessibleTicket(actor: User, ticketId: string) {
  const ticket = await prisma.helpdeskTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  const allowed =
    ticket &&
    (ticket.resident.user.id === actor.id ||
      ticket.assignedTo?.id === actor.id ||
      (actor.role === "ADMIN" && ticket.flat.tower.societyId === actor.societyId));
  if (!allowed) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
  }
  return ticket;
}

export async function getTicket(
  actor: User,
  input: { ticketId: string },
): Promise<TicketInfo & { comments: TicketCommentInfo[] }> {
  const ticket = await requireAccessibleTicket(actor, input.ticketId);
  const comments = await prisma.ticketComment.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
  return {
    ...toTicketInfo(ticket),
    comments: comments.map((c) => ({
      id: c.id,
      author: c.author,
      message: c.message,
      photoUrls: c.photoUrls,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/** Status changes are for the society's admins or the ticket's assignee. */
export async function updateTicketStatus(
  actor: User,
  input: { ticketId: string; status: TicketStatus },
): Promise<TicketInfo> {
  const ticket = await requireAccessibleTicket(actor, input.ticketId);
  const mayUpdate =
    ticket.assignedTo?.id === actor.id ||
    (actor.role === "ADMIN" && ticket.flat.tower.societyId === actor.societyId);
  if (!mayUpdate) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an admin or the assignee can change the ticket status",
    });
  }

  const updated = await prisma.helpdeskTicket.update({
    where: { id: ticket.id },
    data: { status: input.status },
    include: ticketInclude,
  });

  await notifyUser(updated.resident.user.id, {
    type: "TICKET_STATUS_CHANGED",
    title: `Ticket ${input.status.toLowerCase().replace("_", " ")}`,
    body: `'${updated.title}' is now ${input.status.toLowerCase().replace("_", " ")}`,
    data: { ticketId: updated.id },
  });

  return toTicketInfo(updated);
}

export async function assignTicket(
  actor: User,
  input: { ticketId: string; assigneeId: string },
): Promise<TicketInfo> {
  const ticket = await requireAccessibleTicket(actor, input.ticketId);
  if (actor.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can assign tickets" });
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: input.assigneeId,
      societyId: ticket.flat.tower.societyId,
      role: { in: ["GUARD", "ADMIN"] },
      isActive: true,
    },
  });
  if (!assignee) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Assignee must be an active guard or admin of this society",
    });
  }

  const updated = await prisma.helpdeskTicket.update({
    where: { id: ticket.id },
    data: { assignedToId: assignee.id },
    include: ticketInclude,
  });
  return toTicketInfo(updated);
}

export async function addComment(
  actor: User,
  input: { ticketId: string; message: string; photoUrls?: string[] },
): Promise<TicketCommentInfo> {
  assertCloudinaryUrls(input.photoUrls);
  const ticket = await requireAccessibleTicket(actor, input.ticketId);
  const comment = await prisma.ticketComment.create({
    data: {
      ticketId: ticket.id,
      authorId: actor.id,
      message: input.message,
      photoUrls: input.photoUrls ?? [],
    },
    include: { author: { select: { id: true, name: true } } },
  });
  return {
    id: comment.id,
    author: comment.author,
    message: comment.message,
    photoUrls: comment.photoUrls,
    createdAt: comment.createdAt.toISOString(),
  };
}
