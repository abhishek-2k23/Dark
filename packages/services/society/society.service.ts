import { TRPCError } from "@trpc/server";
import {
  prisma,
  type User,
  type FlatType,
  type PayoutOnboardingStatus,
} from "@repo/database";
import { assertCloudinaryUrl } from "@repo/cloudinary";

import { assertValidVpa } from "../dues/upi";

/**
 * Society/tower/flat management. Every function takes the acting admin as
 * `actor` and scopes all reads/writes to `actor.societyId` — role gating
 * itself happens in the tRPC middleware (adminProcedure), while ownership
 * scoping lives here so it can't be bypassed by a future route mistake.
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

export interface SocietyInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  towerCount: number;
  /** Payouts — see docs/payments.md. Both optional and independent. */
  upiVpa: string | null;
  payoutStatus: PayoutOnboardingStatus;
  /** Whether residents can be offered the gateway rail right now. */
  gatewayReady: boolean;
}

export async function getSociety(actor: User): Promise<SocietyInfo> {
  const societyId = actorSocietyId(actor);
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    include: { _count: { select: { towers: true } } },
  });
  if (!society) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Society not found" });
  }
  return {
    id: society.id,
    name: society.name,
    logoUrl: society.logoUrl,
    address: society.address,
    city: society.city,
    state: society.state,
    pincode: society.pincode,
    towerCount: society._count.towers,
    upiVpa: society.upiVpa,
    payoutStatus: society.payoutStatus,
    gatewayReady: society.payoutStatus === "ACTIVE" && society.razorpayAccountId !== null,
  };
}

export async function updateSociety(
  actor: User,
  input: {
    name?: string;
    /** undefined leaves the current logo alone; null clears it. */
    logoUrl?: string | null;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    /**
     * undefined leaves the current VPA alone; null clears it (closing the
     * UPI-direct rail and leaving residents on offline).
     */
    upiVpa?: string | null;
  },
): Promise<SocietyInfo> {
  assertCloudinaryUrl(input.logoUrl);
  // Money sent to a mistyped VPA is gone and cannot be recalled. Shape is the
  // only thing checkable without a gateway lookup, so the UI also asks for it
  // twice and shows the payee name the payer's UPI app resolves.
  if (input.upiVpa) assertValidVpa(input.upiVpa);
  const societyId = actorSocietyId(actor);
  await prisma.society.update({ where: { id: societyId }, data: input });
  return getSociety(actor);
}

export interface TowerInfo {
  id: string;
  name: string;
  flatCount: number;
}

function toTowerInfo(tower: { id: string; name: string; _count: { flats: number } }): TowerInfo {
  return { id: tower.id, name: tower.name, flatCount: tower._count.flats };
}

const towerInclude = { _count: { select: { flats: true } } } as const;

export async function createTower(actor: User, input: { name: string }): Promise<TowerInfo> {
  const societyId = actorSocietyId(actor);
  const existing = await prisma.tower.findUnique({
    where: { societyId_name: { societyId, name: input.name } },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `A tower named '${input.name}' already exists in this society`,
    });
  }
  const tower = await prisma.tower.create({
    data: { societyId, name: input.name },
    include: towerInclude,
  });
  return toTowerInfo(tower);
}

export async function updateTower(
  actor: User,
  input: { towerId: string; name: string },
): Promise<TowerInfo> {
  const societyId = actorSocietyId(actor);
  const tower = await prisma.tower.findFirst({
    where: { id: input.towerId, societyId },
  });
  if (!tower) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tower not found" });
  }
  const duplicate = await prisma.tower.findUnique({
    where: { societyId_name: { societyId, name: input.name } },
  });
  if (duplicate && duplicate.id !== tower.id) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `A tower named '${input.name}' already exists in this society`,
    });
  }
  const updated = await prisma.tower.update({
    where: { id: tower.id },
    data: { name: input.name },
    include: towerInclude,
  });
  return toTowerInfo(updated);
}

export async function listTowers(actor: User): Promise<TowerInfo[]> {
  const societyId = actorSocietyId(actor);
  const towers = await prisma.tower.findMany({
    where: { societyId },
    orderBy: { name: "asc" },
    include: towerInclude,
  });
  return towers.map(toTowerInfo);
}

export interface FlatInfo {
  id: string;
  towerId: string;
  towerName: string;
  flatNumber: string;
  floor: number;
  type: FlatType;
  residentCount: number;
  /**
   * The flat already has a primary resident, so it is not available to be
   * allotted again. Drives the greyed-out flats in the admin pickers.
   */
  isOccupied: boolean;
}

const flatInclude = {
  tower: { select: { name: true } },
  _count: { select: { residents: true } },
  // Existence check, not a list: one row is enough to know it is taken.
  residents: { where: { isPrimaryResident: true }, select: { id: true }, take: 1 },
} as const;

function toFlatInfo(flat: {
  id: string;
  towerId: string;
  flatNumber: string;
  floor: number;
  type: FlatType;
  tower: { name: string };
  _count: { residents: number };
  residents: { id: string }[];
}): FlatInfo {
  return {
    id: flat.id,
    towerId: flat.towerId,
    towerName: flat.tower.name,
    flatNumber: flat.flatNumber,
    floor: flat.floor,
    type: flat.type,
    residentCount: flat._count.residents,
    isOccupied: flat.residents.length > 0,
  };
}

/** Resolves a tower by id and asserts it belongs to the actor's society. */
async function requireTowerInSociety(actor: User, towerId: string) {
  const tower = await prisma.tower.findFirst({
    where: { id: towerId, societyId: actorSocietyId(actor) },
  });
  if (!tower) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tower not found" });
  }
  return tower;
}

export async function createFlat(
  actor: User,
  input: { towerId: string; flatNumber: string; floor: number; type: FlatType },
): Promise<FlatInfo> {
  const tower = await requireTowerInSociety(actor, input.towerId);
  const existing = await prisma.flat.findUnique({
    where: { towerId_flatNumber: { towerId: tower.id, flatNumber: input.flatNumber } },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Flat '${input.flatNumber}' already exists in tower '${tower.name}'`,
    });
  }
  const flat = await prisma.flat.create({
    data: {
      towerId: tower.id,
      flatNumber: input.flatNumber,
      floor: input.floor,
      type: input.type,
    },
    include: flatInclude,
  });
  return toFlatInfo(flat);
}

export async function updateFlat(
  actor: User,
  input: { flatId: string; flatNumber?: string; floor?: number; type?: FlatType },
): Promise<FlatInfo> {
  const societyId = actorSocietyId(actor);
  const flat = await prisma.flat.findFirst({
    where: { id: input.flatId, tower: { societyId } },
    include: { tower: { select: { name: true } } },
  });
  if (!flat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Flat not found" });
  }
  if (input.flatNumber && input.flatNumber !== flat.flatNumber) {
    const duplicate = await prisma.flat.findUnique({
      where: { towerId_flatNumber: { towerId: flat.towerId, flatNumber: input.flatNumber } },
    });
    if (duplicate) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Flat '${input.flatNumber}' already exists in tower '${flat.tower.name}'`,
      });
    }
  }
  const updated = await prisma.flat.update({
    where: { id: flat.id },
    data: {
      flatNumber: input.flatNumber,
      floor: input.floor,
      type: input.type,
    },
    include: flatInclude,
  });
  return toFlatInfo(updated);
}

export async function listFlats(
  actor: User,
  input: { towerId?: string; cursor?: string; limit: number },
): Promise<{ items: FlatInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);
  if (input.towerId) await requireTowerInSociety(actor, input.towerId);

  const flats = await prisma.flat.findMany({
    where: { tower: { societyId }, towerId: input.towerId },
    orderBy: [{ tower: { name: "asc" } }, { flatNumber: "asc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: flatInclude,
  });

  const hasMore = flats.length > input.limit;
  const items = (hasMore ? flats.slice(0, input.limit) : flats).map(toFlatInfo);
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
