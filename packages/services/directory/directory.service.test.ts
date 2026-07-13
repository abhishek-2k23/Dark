import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as directoryService from "./directory.service";

const runId = `dir-${Date.now().toString(36)}`;

let societyId: string;
let admin: User;
let resident: User;
let foreignAdmin: User;

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
      name: `DIR Society ${runId}`,
      address: "1 Dir St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const otherSociety = await prisma.society.create({
    data: {
      name: `DIR Other ${runId}`,
      address: "2 Dir St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  const tower = await prisma.tower.create({ data: { societyId, name: `DR-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "DR-101", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "RESIDENT" | "ADMIN", sid: string, flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  admin = await mkUser("DIR Admin", "ADMIN", societyId);
  resident = await mkUser("DIR Resident", "RESIDENT", societyId, flat.id);
  foreignAdmin = await mkUser("DIR Foreign Admin", "ADMIN", otherSociety.id);
});

afterAll(async () => {
  const societies = await prisma.society.findMany({
    where: { name: { contains: runId } },
    select: { id: true },
  });
  const societyIds = societies.map((s) => s.id);
  await prisma.serviceProvider.deleteMany({ where: { societyId: { in: societyIds } } });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("service provider directory", () => {
  let providerId: string;

  it("admin adds providers; residents list them with a category filter", async () => {
    const plumber = await directoryService.createServiceProvider(admin, {
      name: "Suresh Pipes",
      category: "PLUMBER",
      phone: "+919911111111",
    });
    providerId = plumber.id;
    await directoryService.createServiceProvider(admin, {
      name: "Anita Cleans",
      category: "MAID",
      phone: "+919922222222",
      isVerified: true,
    });

    const all = await directoryService.listServiceProviders(resident, {});
    expect(all).toHaveLength(2);

    const maids = await directoryService.listServiceProviders(resident, { category: "MAID" });
    expect(maids).toHaveLength(1);
    expect(maids[0]!.isVerified).toBe(true);
  });

  it("admin verifies and updates a provider", async () => {
    const updated = await directoryService.updateServiceProvider(admin, {
      serviceProviderId: providerId,
      isVerified: true,
      phone: "+919933333333",
    });
    expect(updated.isVerified).toBe(true);
    expect(updated.phone).toBe("+919933333333");
  });

  it("cross-society admins cannot touch or see the entries", async () => {
    await expectTRPCError(
      directoryService.updateServiceProvider(foreignAdmin, {
        serviceProviderId: providerId,
        name: "Hijack",
      }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      directoryService.deleteServiceProvider(foreignAdmin, { serviceProviderId: providerId }),
      "NOT_FOUND",
    );
    const foreignView = await directoryService.listServiceProviders(foreignAdmin, {});
    expect(foreignView).toHaveLength(0);
  });

  it("admin deletes a provider", async () => {
    await directoryService.deleteServiceProvider(admin, { serviceProviderId: providerId });
    const remaining = await directoryService.listServiceProviders(admin, {});
    expect(remaining).toHaveLength(1);
  });
});
