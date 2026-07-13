import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as profileService from "./profile.service";

/**
 * Proves the services actually enforce the Cloudinary URL check (the
 * validator itself is unit-tested in @repo/cloudinary). Env is per test
 * file (vitest forks), so setting the cloud name here leaks nowhere.
 */

const runId = `mu-${Date.now().toString(36)}`;
const CLOUD = "portl-test-cloud";

let societyId: string;
let resident: User;

beforeAll(async () => {
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;

  const society = await prisma.society.create({
    data: {
      name: `MU Society ${runId}`,
      address: "1 MU St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `MU-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "MU-101", floor: 1, type: "TWO_BHK" },
  });
  resident = await prisma.user.create({
    data: {
      name: "MU Resident",
      email: `mu-resident-${runId}@test.local`,
      passwordHash: "unused",
      role: "RESIDENT",
      societyId,
      residentProfile: { create: { flatId: flat.id } },
    },
  });
});

afterAll(async () => {
  await prisma.residentProfile.deleteMany({ where: { userId: resident.id } });
  await prisma.user.deleteMany({ where: { id: resident.id } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("media URL enforcement in mutations", () => {
  it("rejects an avatar URL from a foreign host", async () => {
    try {
      await profileService.updateMyProfile(resident, {
        avatarUrl: "https://evil.example.com/avatar.jpg",
      });
      expect.unreachable("expected BAD_REQUEST");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("stores an avatar URL from the configured cloud", async () => {
    const url = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/avatars/me.jpg`;
    const updated = await profileService.updateMyProfile(resident, { avatarUrl: url });
    expect(updated.avatarUrl).toBe(url);
  });
});
