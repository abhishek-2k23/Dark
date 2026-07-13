import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@repo/database";

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
  createdAt: string;
}

function toTicketInfo(ticket: TicketRow): TicketInfo {
  return {
    id: ticket.id,
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
  const profile = await actorResidentProfile(actor);
  const ticket = await prisma.helpdeskTicket.create({
    data: {
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

  // TODO(Phase 8): NotificationService — notify the raising resident of the
  // status change here.

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
  input: { ticketId: string; message: string },
): Promise<TicketCommentInfo> {
  const ticket = await requireAccessibleTicket(actor, input.ticketId);
  const comment = await prisma.ticketComment.create({
    data: { ticketId: ticket.id, authorId: actor.id, message: input.message },
    include: { author: { select: { id: true, name: true } } },
  });
  return {
    id: comment.id,
    author: comment.author,
    message: comment.message,
    createdAt: comment.createdAt.toISOString(),
  };
}
