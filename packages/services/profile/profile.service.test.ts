import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as profileService from "./profile.service";

const runId = `prf-${Date.now().toString(36)}`;

let societyId: string;
let residentA: User;
let residentB: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `Prf Society ${runId}`,
      address: "1 Prf St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `PT-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "P-101", floor: 1, type: "TWO_BHK" },
  });

  const mkResident = (tag: string) =>
    prisma.user.create({
      data: {
        name: `Resident ${tag}`,
        email: `prf-${tag}-${runId}@test.local`,
        passwordHash: "unused",
        role: "RESIDENT",
        societyId,
        residentProfile: { create: { flatId: flat.id } },
      },
    });
  residentA = await mkResident("a");
  residentB = await mkResident("b");
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const profiles = await prisma.residentProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);
  await prisma.familyMember.deleteMany({ where: { residentProfileId: { in: profileIds } } });
  await prisma.vehicle.deleteMany({ where: { residentProfileId: { in: profileIds } } });
  await prisma.residentProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("profile.me / update", () => {
  it("returns the resident sub-profile with flat details", async () => {
    const profile = await profileService.getMyProfile(residentA);
    expect(profile.role).toBe("RESIDENT");
    expect(profile.residentProfile?.flatNumber).toBe("P-101");
    expect(profile.residentProfile?.towerName).toBe(`PT-${runId}`);
    expect(profile.guardProfile).toBeNull();
    expect(profile.adminProfile).toBeNull();
    expect(profile.society?.id).toBe(societyId);
  });

  it("updates name and emergency contact", async () => {
    const updated = await profileService.updateMyProfile(residentA, {
      name: "Renamed A",
      emergencyContactName: "Contact A",
      emergencyContactPhone: "+911234567890",
    });
    expect(updated.name).toBe("Renamed A");
    expect(updated.emergencyContactName).toBe("Contact A");
    expect(updated.emergencyContactPhone).toBe("+911234567890");
  });
});

describe("family members", () => {
  let memberId: string;

  it("adds and updates an own family member", async () => {
    const member = await profileService.addFamilyMember(residentA, {
      name: "Kid A",
      relation: "child",
      age: 8,
    });
    memberId = member.id;

    const updated = await profileService.updateFamilyMember(residentA, {
      familyMemberId: memberId,
      age: 9,
    });
    expect(updated.age).toBe(9);
    expect(updated.name).toBe("Kid A");
  });

  it("cannot touch another resident's family member", async () => {
    await expectTRPCError(
      profileService.updateFamilyMember(residentB, {
        familyMemberId: memberId,
        name: "Hijack",
      }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      profileService.removeFamilyMember(residentB, { familyMemberId: memberId }),
      "NOT_FOUND",
    );
  });

  it("removes an own family member", async () => {
    await profileService.removeFamilyMember(residentA, { familyMemberId: memberId });
    const gone = await prisma.familyMember.findUnique({ where: { id: memberId } });
    expect(gone).toBeNull();
  });
});

describe("vehicles", () => {
  let vehicleId: string;

  it("adds a vehicle and rejects a duplicate number on the same profile", async () => {
    const vehicle = await profileService.addVehicle(residentA, {
      number: `KA-01-${runId}`,
      type: "CAR",
    });
    vehicleId = vehicle.id;

    await expectTRPCError(
      profileService.addVehicle(residentA, { number: `KA-01-${runId}`, type: "BIKE" }),
      "CONFLICT",
    );

    // Same number on a different resident's profile is allowed.
    const other = await profileService.addVehicle(residentB, {
      number: `KA-01-${runId}`,
      type: "CAR",
    });
    expect(other.id).not.toBe(vehicleId);
  });

  it("cannot touch another resident's vehicle", async () => {
    await expectTRPCError(
      profileService.updateVehicle(residentB, { vehicleId, type: "OTHER" }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      profileService.removeVehicle(residentB, { vehicleId }),
      "NOT_FOUND",
    );
  });

  it("updates and removes an own vehicle", async () => {
    const updated = await profileService.updateVehicle(residentA, {
      vehicleId,
      type: "OTHER",
    });
    expect(updated.type).toBe("OTHER");

    await profileService.removeVehicle(residentA, { vehicleId });
    const gone = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(gone).toBeNull();
  });
});

describe("non-residents", () => {
  it("family/vehicle mutations require a resident profile (412)", async () => {
    const admin = await prisma.user.create({
      data: {
        name: "Prf Admin",
        email: `prf-admin-${runId}@test.local`,
        passwordHash: "unused",
        role: "ADMIN",
        societyId,
      },
    });
    await expectTRPCError(
      profileService.addFamilyMember(admin, { name: "X", relation: "spouse" }),
      "PRECONDITION_FAILED",
    );
    await expectTRPCError(
      profileService.addVehicle(admin, { number: "X-1", type: "CAR" }),
      "PRECONDITION_FAILED",
    );
  });
});
