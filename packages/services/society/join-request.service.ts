import { TRPCError } from "@trpc/server";
import { prisma, type JoinRequestStatus, type User } from "@repo/database";

import {
  notifyUsers,
  societyAdminUserIds,
} from "../notification/notification.service";
import { shouldBePrimaryResident } from "../resident/occupancy";

/**
 * Society join requests — the resident-initiated counterpart to the admin's
 * PendingResidentInvite. A society-less user names a society admin's email;
 * that admin approves (choosing the flat) or rejects from a queue.
 *
 * Submission never confirms whether the email matched an admin (user's
 * decision: no account enumeration). A typo therefore looks identical to a
 * real request — the requester's own status view is where the truth lives,
 * since showing someone their own request leaks nothing.
 */

/** How long an unanswered request stays actionable. */
const TTL_MIN = () => Number(process.env.JOIN_REQUEST_TTL_MIN ?? 120);
/** How long after ASKING (createdAt, not expiry) an expired request blocks re-asking. */
const COOLDOWN_HOURS = () => Number(process.env.JOIN_REQUEST_COOLDOWN_H ?? 24);

export interface JoinRequestInfo {
  id: string;
  societyName: string;
  status: JoinRequestStatus;
  expiresAt: string;
  /** When an EXPIRED request stops blocking a new one; null otherwise. */
  canRequestAgainAt: string | null;
  createdAt: string;
}

function cooldownEnd(createdAt: Date): Date {
  return new Date(createdAt.getTime() + COOLDOWN_HOURS() * 3_600_000);
}

function toInfo(row: {
  id: string;
  status: JoinRequestStatus;
  expiresAt: Date;
  createdAt: Date;
  society: { name: string };
}): JoinRequestInfo {
  // A PENDING row past its expiry is already dead even if the sweep hasn't
  // flipped it yet — never show a countdown that has finished.
  const effective: JoinRequestStatus =
    row.status === "PENDING" && row.expiresAt <= new Date() ? "EXPIRED" : row.status;
  return {
    id: row.id,
    societyName: row.society.name,
    status: effective,
    expiresAt: row.expiresAt.toISOString(),
    canRequestAgainAt:
      effective === "EXPIRED" ? cooldownEnd(row.createdAt).toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Ask to join the society whose admin owns `adminEmail`. Always resolves to the
 * same `{ submitted: true }` whether or not the email matched — but the actor's
 * OWN prior requests still produce honest errors (a pending duplicate, a
 * rejection, a cooldown), because those reveal nothing about the email.
 */
export async function submitJoinRequest(
  actor: User,
  input: { adminEmail: string },
): Promise<{ submitted: true }> {
  if (actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "You already belong to a society",
    });
  }

  // One live request at a time, regardless of target — parallel requests would
  // let one user sit in several admin queues at once.
  const pending = await prisma.societyJoinRequest.findFirst({
    where: { userId: actor.id, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You already have a pending request — wait for it to be answered",
    });
  }

  const admin = await prisma.user.findFirst({
    where: {
      email: { equals: input.adminEmail, mode: "insensitive" },
      role: "ADMIN",
      isActive: true,
      societyId: { not: null },
    },
    select: { societyId: true },
  });

  // No match: report success anyway. Erroring here would turn this endpoint
  // into an oracle for "is this email a society admin?".
  if (!admin?.societyId) return { submitted: true };
  const societyId = admin.societyId;

  const previous = await prisma.societyJoinRequest.findFirst({
    where: { userId: actor.id, societyId },
    orderBy: { createdAt: "desc" },
  });
  if (previous?.status === "REJECTED") {
    // The requester already knows this society rejected them (they were
    // notified), so an honest error leaks nothing new.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This society declined your request — ask its admin to invite you instead",
    });
  }
  if (previous && previous.status !== "APPROVED") {
    const retryAt = cooldownEnd(previous.createdAt);
    if (retryAt > new Date()) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Your last request lapsed recently — you can ask this society again tomorrow",
      });
    }
  }

  const request = await prisma.societyJoinRequest.create({
    data: {
      userId: actor.id,
      societyId,
      expiresAt: new Date(Date.now() + TTL_MIN() * 60_000),
    },
  });

  await notifyUsers(await societyAdminUserIds(societyId), {
    type: "JOIN_REQUEST_RECEIVED",
    title: "Join request",
    body: `${actor.name} asked to join your society.`,
    data: { joinRequestId: request.id },
  });

  return { submitted: true };
}

/** The actor's most recent request, for the no-society screen. Null if none. */
export async function myJoinRequest(actor: User): Promise<JoinRequestInfo | null> {
  const row = await prisma.societyJoinRequest.findFirst({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    include: { society: { select: { name: true } } },
  });
  return row ? toInfo(row) : null;
}

export interface PendingJoinRequestInfo {
  id: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  userAvatarUrl: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Admin queue: live requests for the actor's society, oldest first. */
export async function listJoinRequests(
  actor: User,
  input: { cursor?: string; limit: number },
): Promise<{ items: PendingJoinRequestInfo[]; nextCursor: string | null }> {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }

  const rows = await prisma.societyJoinRequest.findMany({
    where: {
      societyId: actor.societyId,
      status: "PENDING",
      // Lapsed requests leave the queue immediately — the sweep flipping them
      // to EXPIRED later is bookkeeping, not what hides them.
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      user: { select: { name: true, email: true, phone: true, avatarUrl: true } },
    },
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const items = page.map((r) => ({
    id: r.id,
    userName: r.user.name,
    userEmail: r.user.email,
    userPhone: r.user.phone,
    userAvatarUrl: r.user.avatarUrl,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Approve (with a flat — a resident without one can't use visitors, dues, or
 * tickets) or reject. Approval attaches the user to the society and creates
 * their resident profile in one transaction; their next session refresh picks
 * the society up, exactly like a claimed invite.
 */
export async function decideJoinRequest(
  actor: User,
  input: { requestId: string; approve: boolean; flatId?: string },
): Promise<{ status: JoinRequestStatus }> {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }

  const request = await prisma.societyJoinRequest.findFirst({
    where: { id: input.requestId, societyId: actor.societyId },
    include: { user: { select: { id: true, societyId: true } } },
  });
  if (!request) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
  }
  if (request.status !== "PENDING") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This request is already ${request.status}`,
    });
  }
  if (request.expiresAt <= new Date()) {
    // Flip it on the spot rather than waiting for the sweep, so the admin
    // gets a truthful error and the row leaves the queue.
    await prisma.societyJoinRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED" },
    });
    throw new TRPCError({ code: "CONFLICT", message: "This request has expired" });
  }

  const decidedAt = new Date();

  if (!input.approve) {
    await prisma.societyJoinRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedByAdminId: actor.id, decidedAt },
    });
    await notifyUsers([request.user.id], {
      type: "JOIN_REQUEST_REJECTED",
      title: "Request declined",
      body: "Your request to join the society was declined.",
      data: { joinRequestId: request.id },
    });
    return { status: "REJECTED" };
  }

  if (!input.flatId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pick the flat this resident belongs to",
    });
  }
  if (request.user.societyId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This user has already joined a society",
    });
  }
  const flat = await prisma.flat.findFirst({
    where: { id: input.flatId, tower: { societyId: actor.societyId } },
  });
  if (!flat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Flat not found" });
  }

  // Resolved before the transaction because this is the array form, which takes
  // prepared operations rather than a callback. The window is harmless: two
  // admins approving into the same empty flat at once would both read "empty",
  // and the worst case is two primaries — which the occupied check then keeps
  // anyone else out of.
  const isPrimaryResident = await shouldBePrimaryResident(prisma, flat.id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.user.id },
      data: {
        societyId: actor.societyId,
        residentProfile: { create: { flatId: flat.id, isPrimaryResident } },
      },
    }),
    prisma.societyJoinRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", decidedByAdminId: actor.id, decidedAt },
    }),
  ]);

  await notifyUsers([request.user.id], {
    type: "JOIN_REQUEST_APPROVED",
    title: "Welcome!",
    body: "Your request was approved — pull to refresh and step inside.",
    data: { joinRequestId: request.id },
  });
  return { status: "APPROVED" };
}

/** Sweep: PENDING requests past their TTL become EXPIRED. Returns count. */
export async function expireStaleJoinRequests(): Promise<number> {
  const res = await prisma.societyJoinRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}
