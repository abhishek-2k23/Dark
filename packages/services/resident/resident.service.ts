import { TRPCError } from "@trpc/server";
import { prisma, type User, type InviteStatus } from "@repo/database";

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
