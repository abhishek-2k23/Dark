import { TRPCError } from "@trpc/server";
import {
  prisma,
  type AdminDesignation,
  type User,
  type VehicleType,
} from "@repo/database";
import { assertCloudinaryUrl } from "@repo/cloudinary";

/**
 * Self-service profile management for the calling user (any role), plus the
 * resident-only family-member and vehicle sub-resources. Ownership scoping
 * (a resident can only touch their own records) lives here.
 */

export interface FamilyMemberInfo {
  id: string;
  name: string;
  relation: string;
  age: number | null;
  photoUrl: string | null;
}

export interface VehicleInfo {
  id: string;
  number: string;
  type: VehicleType;
}

export interface MyProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: User["role"];
  avatarUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  society: { id: string; name: string } | null;
  residentProfile: {
    flatId: string;
    flatNumber: string;
    towerName: string;
    isPrimaryResident: boolean;
    moveInDate: string | null;
    familyMembers: FamilyMemberInfo[];
    vehicles: VehicleInfo[];
  } | null;
  guardProfile: {
    gateAssigned: string | null;
    shiftStart: string | null;
    shiftEnd: string | null;
  } | null;
  adminProfile: { designation: AdminDesignation | null } | null;
}

export async function getMyProfile(actor: User): Promise<MyProfile> {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    include: {
      society: { select: { id: true, name: true } },
      residentProfile: {
        include: {
          flat: { include: { tower: { select: { name: true } } } },
          familyMembers: true,
          vehicles: true,
        },
      },
      guardProfile: true,
      adminProfile: true,
    },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    society: user.society,
    residentProfile: user.residentProfile
      ? {
          flatId: user.residentProfile.flatId,
          flatNumber: user.residentProfile.flat.flatNumber,
          towerName: user.residentProfile.flat.tower.name,
          isPrimaryResident: user.residentProfile.isPrimaryResident,
          moveInDate: user.residentProfile.moveInDate?.toISOString() ?? null,
          familyMembers: user.residentProfile.familyMembers.map((m) => ({
            id: m.id,
            name: m.name,
            relation: m.relation,
            age: m.age,
            photoUrl: m.photoUrl,
          })),
          vehicles: user.residentProfile.vehicles.map((v) => ({
            id: v.id,
            number: v.number,
            type: v.type,
          })),
        }
      : null,
    guardProfile: user.guardProfile
      ? {
          gateAssigned: user.guardProfile.gateAssigned,
          shiftStart: user.guardProfile.shiftStart,
          shiftEnd: user.guardProfile.shiftEnd,
        }
      : null,
    adminProfile: user.adminProfile
      ? { designation: user.adminProfile.designation }
      : null,
  };
}

export async function updateMyProfile(
  actor: User,
  input: {
    name?: string;
    /** undefined leaves the current photo alone; null clears it. */
    avatarUrl?: string | null;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  },
): Promise<MyProfile> {
  assertCloudinaryUrl(input.avatarUrl);
  await prisma.user.update({ where: { id: actor.id }, data: input });
  return getMyProfile(actor);
}

/** Resolves the acting resident's profile id, or 412 for non-residents. */
async function actorResidentProfileId(actor: User): Promise<string> {
  const profile = await prisma.residentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account has no resident profile",
    });
  }
  return profile.id;
}

// ---------------------------------------------------------------------------
// Family members
// ---------------------------------------------------------------------------

export async function addFamilyMember(
  actor: User,
  input: { name: string; relation: string; age?: number; photoUrl?: string },
): Promise<FamilyMemberInfo> {
  assertCloudinaryUrl(input.photoUrl);
  const residentProfileId = await actorResidentProfileId(actor);
  const member = await prisma.familyMember.create({
    data: { residentProfileId, ...input },
  });
  return {
    id: member.id,
    name: member.name,
    relation: member.relation,
    age: member.age,
    photoUrl: member.photoUrl,
  };
}

async function requireOwnFamilyMember(actor: User, familyMemberId: string) {
  const residentProfileId = await actorResidentProfileId(actor);
  const member = await prisma.familyMember.findFirst({
    where: { id: familyMemberId, residentProfileId },
  });
  if (!member) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Family member not found" });
  }
  return member;
}

export async function updateFamilyMember(
  actor: User,
  input: {
    familyMemberId: string;
    name?: string;
    relation?: string;
    age?: number;
    /** undefined leaves the current photo alone; null clears it. */
    photoUrl?: string | null;
  },
): Promise<FamilyMemberInfo> {
  assertCloudinaryUrl(input.photoUrl);
  const member = await requireOwnFamilyMember(actor, input.familyMemberId);
  const updated = await prisma.familyMember.update({
    where: { id: member.id },
    data: {
      name: input.name,
      relation: input.relation,
      age: input.age,
      photoUrl: input.photoUrl,
    },
  });
  return {
    id: updated.id,
    name: updated.name,
    relation: updated.relation,
    age: updated.age,
    photoUrl: updated.photoUrl,
  };
}

export async function removeFamilyMember(
  actor: User,
  input: { familyMemberId: string },
): Promise<void> {
  const member = await requireOwnFamilyMember(actor, input.familyMemberId);
  await prisma.familyMember.delete({ where: { id: member.id } });
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export async function addVehicle(
  actor: User,
  input: { number: string; type: VehicleType },
): Promise<VehicleInfo> {
  const residentProfileId = await actorResidentProfileId(actor);
  const existing = await prisma.vehicle.findUnique({
    where: {
      residentProfileId_number: { residentProfileId, number: input.number },
    },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Vehicle '${input.number}' is already registered`,
    });
  }
  const vehicle = await prisma.vehicle.create({
    data: { residentProfileId, number: input.number, type: input.type },
  });
  return { id: vehicle.id, number: vehicle.number, type: vehicle.type };
}

async function requireOwnVehicle(actor: User, vehicleId: string) {
  const residentProfileId = await actorResidentProfileId(actor);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, residentProfileId },
  });
  if (!vehicle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  }
  return vehicle;
}

export async function updateVehicle(
  actor: User,
  input: { vehicleId: string; number?: string; type?: VehicleType },
): Promise<VehicleInfo> {
  const vehicle = await requireOwnVehicle(actor, input.vehicleId);
  if (input.number && input.number !== vehicle.number) {
    const duplicate = await prisma.vehicle.findUnique({
      where: {
        residentProfileId_number: {
          residentProfileId: vehicle.residentProfileId,
          number: input.number,
        },
      },
    });
    if (duplicate) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Vehicle '${input.number}' is already registered`,
      });
    }
  }
  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { number: input.number, type: input.type },
  });
  return { id: updated.id, number: updated.number, type: updated.type };
}

export async function removeVehicle(
  actor: User,
  input: { vehicleId: string },
): Promise<void> {
  const vehicle = await requireOwnVehicle(actor, input.vehicleId);
  await prisma.vehicle.delete({ where: { id: vehicle.id } });
}
