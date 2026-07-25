import { TRPCError } from "@trpc/server";
import { prisma, type User, type InviteStatus } from "@repo/database";

import { isFlatOccupied } from "./occupancy";

/**
 * Admin-side resident management: invites, listing, activation. All functions
 * take the acting admin as `actor` and scope to `actor.societyId` (role
 * gating happens in the tRPC middleware).
 */

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

export interface InviteInfo {
  id: string;
  flatId: string;
  email: string | null;
  phone: string | null;
  status: InviteStatus;
  createdAt: string;
}

export async function inviteResident(
  actor: User,
  input: { flatId: string; email?: string; phone?: string },
): Promise<InviteInfo> {
  const societyId = actorSocietyId(actor);
  const { flatId, email, phone } = input;

  if (!email && !phone) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email or a phone number for the invite",
    });
  }

  const flat = await prisma.flat.findFirst({
    where: { id: flatId, tower: { societyId } },
  });
  if (!flat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Flat not found" });
  }

  // The picker greys these out, but a flat can be taken between the screen
  // loading and the invite being sent — and the endpoint is reachable directly.
  if (await isFlatOccupied(flat.id)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Flat '${flat.flatNumber}' already has a resident`,
    });
  }

  const identifierOr: Array<{ email: string } | { phone: string }> = [];
  if (email) identifierOr.push({ email });
  if (phone) identifierOr.push({ phone });

  const existingUser = await prisma.user.findFirst({ where: { OR: identifierOr } });
  if (existingUser) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account already exists with this email or phone",
    });
  }

  const existingInvite = await prisma.pendingResidentInvite.findFirst({
    where: { status: "PENDING", OR: identifierOr },
  });
  if (existingInvite) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A pending invite already exists for this email or phone",
    });
  }

  const invite = await prisma.pendingResidentInvite.create({
    data: { societyId, flatId, email, phone, invitedByAdminId: actor.id },
  });
  return {
    id: invite.id,
    flatId: invite.flatId,
    email: invite.email,
    phone: invite.phone,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
  };
}

export interface ResidentInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  flatId: string;
  flatNumber: string;
  towerId: string;
  towerName: string;
  isPrimaryResident: boolean;
  createdAt: string;
}

export async function listResidents(
  actor: User,
  input: {
    towerId?: string;
    flatId?: string;
    status: "ACTIVE" | "INACTIVE" | "ALL";
    search?: string;
    cursor?: string;
    limit: number;
  },
): Promise<{ items: ResidentInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);

  const users = await prisma.user.findMany({
    where: {
      role: "RESIDENT",
      societyId,
      ...(input.status === "ALL" ? {} : { isActive: input.status === "ACTIVE" }),
      residentProfile: {
        is: {
          ...(input.flatId ? { flatId: input.flatId } : {}),
          ...(input.towerId ? { flat: { towerId: input.towerId } } : {}),
        },
      },
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { email: { contains: input.search, mode: "insensitive" } },
              { phone: { contains: input.search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      residentProfile: {
        include: { flat: { include: { tower: { select: { id: true, name: true } } } } },
      },
    },
  });

  const hasMore = users.length > input.limit;
  const page = hasMore ? users.slice(0, input.limit) : users;
  const items = page.map((user) => {
    // residentProfile can't be null here: the where clause filters on it.
    const profile = user.residentProfile!;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      flatId: profile.flatId,
      flatNumber: profile.flat.flatNumber,
      towerId: profile.flat.tower.id,
      towerName: profile.flat.tower.name,
      isPrimaryResident: profile.isPrimaryResident,
      createdAt: user.createdAt.toISOString(),
    };
  });
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/**
 * Fill in a resident's missing email or phone.
 *
 * Deliberately **fill-only**: an admin may supply a contact the record does not
 * have, but may never overwrite one it already has. Letting an admin rewrite a
 * resident's email would hand them a password-reset path into that account, and
 * the need this serves is entirely about blanks — a bulk-imported row with no
 * email cannot be claimed at all, because signup matches on email.
 *
 * The email is lowercased and stripped of whitespace to match `import.service`,
 * so the address stored here is the one signup will compare against when the
 * resident finally claims the account.
 */
export async function updateResidentContact(
  actor: User,
  input: { userId: string; email?: string; phone?: string },
): Promise<{ id: string; email: string | null; phone: string | null }> {
  const societyId = actorSocietyId(actor);

  const email = input.email?.toLowerCase().replace(/\s+/g, "") || undefined;
  const phone = input.phone?.trim() || undefined;

  if (!email && !phone) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Provide an email or a phone number",
    });
  }

  const target = await prisma.user.findFirst({
    where: { id: input.userId, role: "RESIDENT", societyId },
  });
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resident not found" });
  }

  if (email && target.email) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This resident already has an email. It can only be changed by the resident.",
    });
  }
  if (phone && target.phone) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This resident already has a phone. It can only be changed by the resident.",
    });
  }

  // Both columns are unique app-wide, so a clash is a real conflict rather than
  // a scoping question — checked up front to return a readable error instead of
  // a raw P2002.
  const identifierOr: Array<{ email: string } | { phone: string }> = [];
  if (email) identifierOr.push({ email });
  if (phone) identifierOr.push({ phone });
  const clash = await prisma.user.findFirst({
    where: { OR: identifierOr, NOT: { id: target.id } },
  });
  if (clash) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Another account already uses this email or phone",
    });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    // `emailVerified` is deliberately left alone: an admin typing an address is
    // not proof the resident owns it, so the OTP gate still applies at signup.
    data: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
  });

  return { id: updated.id, email: updated.email, phone: updated.phone };
}

/**
 * Deactivating also revokes every refresh token so the resident is logged
 * out everywhere; their access token dies within ~15 min (context checks
 * isActive on every request, so effectively immediately).
 */
export async function setResidentActive(
  actor: User,
  input: { userId: string; isActive: boolean },
): Promise<{ id: string; isActive: boolean }> {
  const societyId = actorSocietyId(actor);
  const target = await prisma.user.findFirst({
    where: { id: input.userId, role: "RESIDENT", societyId },
  });
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resident not found" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: target.id },
      data: { isActive: input.isActive },
    });
    if (!input.isActive) {
      await tx.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return user;
  });

  return { id: updated.id, isActive: updated.isActive };
}
