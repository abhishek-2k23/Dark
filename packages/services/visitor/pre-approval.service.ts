import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { prisma, type Prisma, type User, type PreApprovalStatus } from "@repo/database";
import { sendGuestPassEmail } from "@repo/mailer";
import { logger } from "@repo/logger";

import { toVisitorInfo, visitorInclude, type VisitorInfo } from "./visitor.service";

/**
 * Guest pre-approvals: a resident opens a time window for an expected guest
 * and gets a QR token; the guard verifies the token at the gate, which
 * creates an already-APPROVED Visitor and burns the pre-approval (ACTIVE →
 * USED). ACTIVE pre-approvals whose window has lapsed are flipped to EXPIRED
 * by the periodic sweep (or on verify).
 */

export interface PreApprovalInfo {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  validFrom: string;
  validTo: string;
  vehicleNumber: string | null;
  qrCode: string;
  status: PreApprovalStatus;
  flatId: string;
  createdAt: string;
}

type PreApprovalRow = Prisma.GuestPreApprovalGetPayload<Record<string, never>>;

function toPreApprovalInfo(row: PreApprovalRow): PreApprovalInfo {
  return {
    id: row.id,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    guestEmail: row.guestEmail,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    vehicleNumber: row.vehicleNumber,
    qrCode: row.qrCode,
    status: row.status,
    flatId: row.flatId,
    createdAt: row.createdAt.toISOString(),
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

export async function createPreApproval(
  actor: User,
  input: {
    guestName: string;
    guestPhone: string;
    guestEmail?: string;
    validFrom: string;
    validTo: string;
    vehicleNumber?: string;
  },
): Promise<PreApprovalInfo> {
  const profile = await actorResidentProfile(actor);
  const validFrom = new Date(input.validFrom);
  const validTo = new Date(input.validTo);

  if (validTo <= validFrom) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "validTo must be after validFrom",
    });
  }
  if (validTo <= new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The validity window is entirely in the past",
    });
  }

  const preApproval = await prisma.guestPreApproval.create({
    data: {
      residentId: profile.id,
      flatId: profile.flatId,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail,
      validFrom,
      validTo,
      vehicleNumber: input.vehicleNumber,
      qrCode: crypto.randomBytes(16).toString("hex"),
    },
  });

  if (input.guestEmail) {
    await emailPassToGuest(preApproval, actor, profile.flatId);
  }

  return toPreApprovalInfo(preApproval);
}

/**
 * Best-effort delivery of the pass to the guest. Never throws: the pass
 * already exists and is visible in the app, so a mail failure must not fail
 * the creation the resident just made — they can always show the QR
 * themselves.
 */
async function emailPassToGuest(
  preApproval: PreApprovalRow,
  actor: User,
  flatId: string,
): Promise<void> {
  try {
    const flat = await prisma.flat.findUnique({
      where: { id: flatId },
      include: { tower: { include: { society: { select: { name: true } } } } },
    });
    if (!flat) return;

    await sendGuestPassEmail({
      to: preApproval.guestEmail!,
      guestName: preApproval.guestName,
      societyName: flat.tower.society.name,
      flatLabel: `${flat.tower.name}-${flat.flatNumber}`,
      hostName: actor.name,
      qrCode: preApproval.qrCode,
      validFrom: preApproval.validFrom,
      validTo: preApproval.validTo,
    });
  } catch (err) {
    logger.error("Failed to email guest pass", {
      preApprovalId: preApproval.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Guard verifies a QR token at the gate. On success the pre-approval is
 * marked USED and an already-APPROVED Visitor (purpose GUEST, approved by
 * the pre-approving resident) is created — the guard then marks entry/exit
 * on that visitor as usual.
 */
export async function verifyPreApproval(
  actor: User,
  input: { qrCode: string },
): Promise<{ preApproval: PreApprovalInfo; visitor: VisitorInfo }> {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }

  const preApproval = await prisma.guestPreApproval.findFirst({
    where: { qrCode: input.qrCode, flat: { tower: { societyId: actor.societyId } } },
    include: { resident: { select: { userId: true } } },
  });
  if (!preApproval) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pre-approval not found" });
  }

  if (preApproval.status !== "ACTIVE") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This pre-approval is ${preApproval.status}`,
    });
  }

  const now = new Date();
  if (now < preApproval.validFrom) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This pre-approval is not valid yet (starts ${preApproval.validFrom.toISOString()})`,
    });
  }
  if (now > preApproval.validTo) {
    await prisma.guestPreApproval.update({
      where: { id: preApproval.id },
      data: { status: "EXPIRED" },
    });
    throw new TRPCError({ code: "CONFLICT", message: "This pre-approval has expired" });
  }

  const [used, visitor] = await prisma.$transaction([
    prisma.guestPreApproval.update({
      where: { id: preApproval.id },
      data: { status: "USED" },
    }),
    prisma.visitor.create({
      data: {
        name: preApproval.guestName,
        phone: preApproval.guestPhone ?? "",
        purpose: "GUEST",
        vehicleNumber: preApproval.vehicleNumber,
        flatId: preApproval.flatId,
        registeredByGuardId: actor.id,
        status: "APPROVED",
        approvedByResidentId: preApproval.resident.userId,
      },
      include: visitorInclude,
    }),
  ]);

  return { preApproval: toPreApprovalInfo(used), visitor: toVisitorInfo(visitor) };
}

export async function listMyPreApprovals(
  actor: User,
  input: { status?: PreApprovalStatus; limit: number; cursor?: string },
): Promise<{ items: PreApprovalInfo[]; nextCursor: string | null }> {
  const profile = await actorResidentProfile(actor);

  const rows = await prisma.guestPreApproval.findMany({
    where: {
      flatId: profile.flatId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows).map(
    toPreApprovalInfo,
  );
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export async function cancelPreApproval(
  actor: User,
  input: { preApprovalId: string },
): Promise<PreApprovalInfo> {
  const profile = await actorResidentProfile(actor);
  const preApproval = await prisma.guestPreApproval.findFirst({
    where: { id: input.preApprovalId, residentId: profile.id },
  });
  if (!preApproval) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pre-approval not found" });
  }
  if (preApproval.status !== "ACTIVE") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Only ACTIVE pre-approvals can be cancelled — this one is ${preApproval.status}`,
    });
  }

  const cancelled = await prisma.guestPreApproval.update({
    where: { id: preApproval.id },
    data: { status: "CANCELLED" },
  });
  return toPreApprovalInfo(cancelled);
}

/**
 * Flips ACTIVE pre-approvals whose window has lapsed to EXPIRED. Called by
 * the periodic sweep in apps/api. Returns how many were expired.
 */
export async function expireLapsedPreApprovals(): Promise<number> {
  const result = await prisma.guestPreApproval.updateMany({
    where: { status: "ACTIVE", validTo: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
