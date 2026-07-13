import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as societyService from "./society.service";

const runId = `soc-${Date.now().toString(36)}`;

let societyAId: string;
let societyBId: string;
let adminA: User;
let adminB: User;

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
  const societyA = await prisma.society.create({
    data: {
      name: `Society A ${runId}`,
      address: "1 A St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyAId = societyA.id;
  const societyB = await prisma.society.create({
    data: {
      name: `Society B ${runId}`,
      address: "2 B St",
      city: "Testville",
      state: "TS",
      pincode: "000002",
    },
  });
  societyBId = societyB.id;

  adminA = await prisma.user.create({
    data: {
      name: "Admin A",
      email: `admin-a-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId: societyAId,
    },
  });
  adminB = await prisma.user.create({
    data: {
      name: "Admin B",
      email: `admin-b-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId: societyBId,
    },
  });
});

afterAll(async () => {
  const societyIds = [societyAId, societyBId];
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminA.id, adminB.id] } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("society", () => {
  it("gets and updates the admin's own society", async () => {
    const before = await societyService.getSociety(adminA);
    expect(before.name).toBe(`Society A ${runId}`);

    const updated = await societyService.updateSociety(adminA, { city: "Newtown" });
    expect(updated.city).toBe("Newtown");

    // Admin B's society is untouched.
    const other = await societyService.getSociety(adminB);
    expect(other.city).toBe("Testville");
  });

  it("rejects an admin with no society link", async () => {
    await expectTRPCError(
      societyService.getSociety({ ...adminA, societyId: null }),
      "PRECONDITION_FAILED",
    );
  });
});

describe("towers", () => {
  let towerId: string;

  it("creates and lists towers", async () => {
    const tower = await societyService.createTower(adminA, { name: `T1-${runId}` });
    towerId = tower.id;
    expect(tower.flatCount).toBe(0);

    const towers = await societyService.listTowers(adminA);
    expect(towers.map((t) => t.id)).toContain(towerId);

    // Not visible from another society.
    const othersTowers = await societyService.listTowers(adminB);
    expect(othersTowers.map((t) => t.id)).not.toContain(towerId);
  });

  it("rejects a duplicate tower name in the same society", async () => {
    await expectTRPCError(
      societyService.createTower(adminA, { name: `T1-${runId}` }),
      "CONFLICT",
    );
    // Same name is fine in a different society.
    const other = await societyService.createTower(adminB, { name: `T1-${runId}` });
    expect(other.id).not.toBe(towerId);
  });

  it("renames a tower, but not across societies", async () => {
    const renamed = await societyService.updateTower(adminA, {
      towerId,
      name: `T1x-${runId}`,
    });
    expect(renamed.name).toBe(`T1x-${runId}`);

    await expectTRPCError(
      societyService.updateTower(adminB, { towerId, name: "Hijack" }),
      "NOT_FOUND",
    );
  });
});

describe("flats", () => {
  let towerId: string;
  let flatId: string;

  beforeAll(async () => {
    const tower = await societyService.createTower(adminA, { name: `F-${runId}` });
    towerId = tower.id;
  });

  it("creates a flat and rejects duplicates in the same tower", async () => {
    const flat = await societyService.createFlat(adminA, {
      towerId,
      flatNumber: "101",
      floor: 1,
      type: "TWO_BHK",
    });
    flatId = flat.id;
    expect(flat.towerName).toBe(`F-${runId}`);

    await expectTRPCError(
      societyService.createFlat(adminA, {
        towerId,
        flatNumber: "101",
        floor: 1,
        type: "ONE_BHK",
      }),
      "CONFLICT",
    );
  });

  it("rejects creating a flat in another society's tower", async () => {
    await expectTRPCError(
      societyService.createFlat(adminB, {
        towerId,
        flatNumber: "999",
        floor: 9,
        type: "OTHER",
      }),
      "NOT_FOUND",
    );
  });

  it("updates a flat, but not across societies", async () => {
    const updated = await societyService.updateFlat(adminA, { flatId, floor: 2 });
    expect(updated.floor).toBe(2);

    await expectTRPCError(
      societyService.updateFlat(adminB, { flatId, floor: 3 }),
      "NOT_FOUND",
    );
  });

  it("paginates flats with a cursor", async () => {
    await societyService.createFlat(adminA, {
      towerId,
      flatNumber: "102",
      floor: 1,
      type: "ONE_BHK",
    });
    await societyService.createFlat(adminA, {
      towerId,
      flatNumber: "103",
      floor: 1,
      type: "ONE_BHK",
    });

    const page1 = await societyService.listFlats(adminA, { towerId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await societyService.listFlats(adminA, {
      towerId,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const allIds = [...page1.items, ...page2.items].map((f) => f.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it("rejects a towerId filter from another society", async () => {
    await expectTRPCError(
      societyService.listFlats(adminB, { towerId, limit: 20 }),
      "NOT_FOUND",
    );
  });
});
