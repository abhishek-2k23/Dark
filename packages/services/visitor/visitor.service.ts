import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type VisitorPurpose,
  type VisitorStatus,
} from "@repo/database";

import { assertCloudinaryUrl } from "@repo/cloudinary";

import { notifyUser, notifyUsers, flatResidentUserIds } from "../notification/notification.service";

/**
 * Visitor lifecycle. State machine (see docs/api-conventions.md):
 *
 *   PENDING ──approve──▶ APPROVED ──markEntry──▶ (entryTime) ──markExit──▶ (exitTime)
 *      │──deny─────────▶ DENIED
 *      └──ttl elapsed──▶ EXPIRED   (auto-expiry sweep in apps/api)
 *
 * Guards act within their society; residents act on their own flat only.
 */

export const visitorInclude = {
  flat: { include: { tower: { select: { name: true, societyId: true } } } },
  registeredByGuard: { select: { id: true, name: true } },
  approvedByResident: { select: { id: true, name: true } },
} satisfies Prisma.VisitorInclude;

type VisitorRow = Prisma.VisitorGetPayload<{ include: typeof visitorInclude }>;

export interface VisitorInfo {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  purpose: VisitorPurpose;
  vehicleNumber: string | null;
  flatId: string;
  flatNumber: string;
  towerName: string;
  status: VisitorStatus;
  registeredByGuard: { id: string; name: string };
  actionedByResident: { id: string; name: string } | null;
  entryTime: string | null;
  exitTime: string | null;
  createdAt: string;
}

export function toVisitorInfo(visitor: VisitorRow): VisitorInfo {
  return {
    id: visitor.id,
    name: visitor.name,
    phone: visitor.phone,
    photoUrl: visitor.photoUrl,
    purpose: visitor.purpose,
    vehicleNumber: visitor.vehicleNumber,
    flatId: visitor.flatId,
    flatNumber: visitor.flat.flatNumber,
    towerName: visitor.flat.tower.name,
    status: visitor.status,
    registeredByGuard: visitor.registeredByGuard,
    actionedByResident: visitor.approvedByResident,
    entryTime: visitor.entryTime?.toISOString() ?? null,
    exitTime: visitor.exitTime?.toISOString() ?? null,
    createdAt: visitor.createdAt.toISOString(),
  };
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

/** Resolves the acting resident's flat id, or 412 for accounts without one. */
async function actorFlatId(actor: User): Promise<string> {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { flatId: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile.flatId;
}

export async function registerVisitor(
  actor: User,
  input: {
    name: string;
    phone: string;
    purpose: VisitorPurpose;
    flatId: string;
    photoUrl?: string;
    vehicleNumber?: string;
  },
): Promise<VisitorInfo> {
  assertCloudinaryUrl(input.photoUrl);
  const societyId = actorSocietyId(actor);
  const flat = await prisma.flat.findFirst({
    where: { id: input.flatId, tower: { societyId } },
  });
  if (!flat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Flat not found" });
  }

  const visitor = await prisma.visitor.create({
    data: {
      name: input.name,
      phone: input.phone,
      purpose: input.purpose,
      flatId: flat.id,
      photoUrl: input.photoUrl,
      vehicleNumber: input.vehicleNumber,
      registeredByGuardId: actor.id,
    },
    include: visitorInclude,
  });

  await notifyUsers(await flatResidentUserIds(flat.id), {
    type: "VISITOR_PENDING",
    title: "Visitor waiting at the gate",
    body: `${visitor.name} (${visitor.purpose.toLowerCase().replace("_", " ")}) is waiting for your approval`,
    data: { visitorId: visitor.id },
  });

  return toVisitorInfo(visitor);
}

/** Resident approves or denies a PENDING visitor of their own flat. */
export async function decideVisitor(
  actor: User,
  input: { visitorId: string; decision: "APPROVED" | "DENIED" },
): Promise<VisitorInfo> {
  const flatId = await actorFlatId(actor);
  const visitor = await prisma.visitor.findFirst({
    where: { id: input.visitorId, flatId },
  });
  if (!visitor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Visitor not found" });
  }
  if (visitor.status !== "PENDING") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This visitor request is already ${visitor.status}`,
    });
  }

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { status: input.decision, approvedByResidentId: actor.id },
    include: visitorInclude,
  });

  await notifyUser(updated.registeredByGuard.id, {
    type: input.decision === "APPROVED" ? "VISITOR_APPROVED" : "VISITOR_DENIED",
    title: `Visitor ${input.decision.toLowerCase()}`,
    body: `${updated.name} was ${input.decision.toLowerCase()} by the resident of flat ${updated.flat.flatNumber}`,
    data: { visitorId: updated.id },
  });

  return toVisitorInfo(updated);
}

export async function markEntry(
  actor: User,
  input: { visitorId: string },
): Promise<VisitorInfo> {
  const societyId = actorSocietyId(actor);
  const visitor = await prisma.visitor.findFirst({
    where: { id: input.visitorId, flat: { tower: { societyId } } },
  });
  if (!visitor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Visitor not found" });
  }
  if (visitor.status !== "APPROVED") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Entry requires an APPROVED visitor — this one is ${visitor.status}`,
    });
  }
  if (visitor.entryTime) {
    throw new TRPCError({ code: "CONFLICT", message: "Entry is already marked" });
  }

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { entryTime: new Date() },
    include: visitorInclude,
  });
  return toVisitorInfo(updated);
}

export async function markExit(
  actor: User,
  input: { visitorId: string },
): Promise<VisitorInfo> {
  const societyId = actorSocietyId(actor);
  const visitor = await prisma.visitor.findFirst({
    where: { id: input.visitorId, flat: { tower: { societyId } } },
  });
  if (!visitor) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Visitor not found" });
  }
  if (!visitor.entryTime) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This visitor has not been marked as entered",
    });
  }
  if (visitor.exitTime) {
    throw new TRPCError({ code: "CONFLICT", message: "Exit is already marked" });
  }

  const updated = await prisma.visitor.update({
    where: { id: visitor.id },
    data: { exitTime: new Date() },
    include: visitorInclude,
  });
  return toVisitorInfo(updated);
}

/** The resident's live approval queue for their own flat. */
export async function listPending(actor: User): Promise<VisitorInfo[]> {
  const flatId = await actorFlatId(actor);
  const visitors = await prisma.visitor.findMany({
    where: { flatId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: visitorInclude,
  });
  return visitors.map(toVisitorInfo);
}

const PERIOD_MS = {
  TODAY: null, // start of local today, computed below
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

function periodStart(period: "TODAY" | "WEEK" | "MONTH" | "ALL"): Date | undefined {
  if (period === "ALL") return undefined;
  if (period === "TODAY") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return new Date(Date.now() - PERIOD_MS[period]);
}

/**
 * Role-aware history: residents see their own flat only (any flatId filter is
 * ignored); guards and admins see their whole society, optionally narrowed to
 * one flat.
 */
export async function history(
  actor: User,
  input: {
    period: "TODAY" | "WEEK" | "MONTH" | "ALL";
    status?: VisitorStatus;
    flatId?: string;
    cursor?: string;
    limit: number;
  },
): Promise<{ items: VisitorInfo[]; nextCursor: string | null }> {
  const scope: Prisma.VisitorWhereInput =
    actor.role === "RESIDENT"
      ? { flatId: await actorFlatId(actor) }
      : {
          flat: { tower: { societyId: actorSocietyId(actor) } },
          ...(input.flatId ? { flatId: input.flatId } : {}),
        };

  const start = periodStart(input.period);
  const visitors = await prisma.visitor.findMany({
    where: {
      ...scope,
      ...(input.status ? { status: input.status } : {}),
      ...(start ? { createdAt: { gte: start } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: visitorInclude,
  });

  const hasMore = visitors.length > input.limit;
  const items = (hasMore ? visitors.slice(0, input.limit) : visitors).map(toVisitorInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Flips PENDING visitor requests older than `ttlMinutes` to EXPIRED so
 * guards aren't left waiting on unresponsive residents. Called by the
 * periodic sweep in apps/api. Returns how many were expired.
 */
export async function expireStalePendingVisitors(ttlMinutes: number): Promise<number> {
  const threshold = new Date(Date.now() - ttlMinutes * 60 * 1000);
  const result = await prisma.visitor.updateMany({
    where: { status: "PENDING", createdAt: { lt: threshold } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
