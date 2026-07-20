import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as emergencyService from "./emergency.service";

const runId = `emg-${Date.now().toString(36)}`;

let societyId: string;
let otherSocietyId: string;
let flatId: string;
let resident: User;
let neighbour: User;
let guard: User;
let admin: User;
let outsider: User;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

/** Notifications of a type this suite raised, for one recipient. */
function notificationsFor(userId: string, type: "EMERGENCY_RAISED" | "EMERGENCY_RESOLVED") {
  return prisma.notification.findMany({ where: { userId, type } });
}

async function clearNotifications() {
  await prisma.notification.deleteMany({
    where: { userId: { in: [resident.id, neighbour.id, guard.id, admin.id, outsider.id] } },
  });
}

beforeAll(async () => {
  const mkSociety = (n: string, pin: string) =>
    prisma.society.create({
      data: { name: `${n} ${runId}`, address: "1 St", city: "Testville", state: "TS", pincode: pin },
    });
  societyId = (await mkSociety("Emg Society", "000101")).id;
  otherSocietyId = (await mkSociety("Emg Other", "000102")).id;

  const tower = await prisma.tower.create({ data: { societyId, name: `EM-${runId}` } });
  const flat = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "EM-101", floor: 1, type: "TWO_BHK" },
  });
  flatId = flat.id;
  const flat2 = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "EM-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (
    name: string,
    role: "GUARD" | "RESIDENT" | "ADMIN",
    sid: string,
    flat?: string,
  ) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId: sid,
        ...(flat ? { residentProfile: { create: { flatId: flat } } } : {}),
      },
    });

  resident = await mkUser("Emg Resident", "RESIDENT", societyId, flatId);
  neighbour = await mkUser("Emg Neighbour", "RESIDENT", societyId, flat2.id);
  guard = await mkUser("Emg Guard", "GUARD", societyId);
  admin = await mkUser("Emg Admin", "ADMIN", societyId);
  outsider = await mkUser("Emg Outsider", "RESIDENT", otherSocietyId);
});

afterAll(async () => {
  const societyIds = [societyId, otherSocietyId];
  await prisma.emergencyAlert.deleteMany({ where: { societyId: { in: societyIds } } });
  const users = await prisma.user.findMany({
    where: { societyId: { in: societyIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId: { in: societyIds } } } });
  await prisma.tower.deleteMany({ where: { societyId: { in: societyIds } } });
  await prisma.society.deleteMany({ where: { id: { in: societyIds } } });
  await prisma.$disconnect();
});

describe("raise", () => {
  it("alarms every other member of the society, across all roles", async () => {
    await clearNotifications();
    const alert = await emergencyService.raiseEmergency(resident, {
      type: "FIRE",
      note: "Smoke in the stairwell",
    });

    expect(alert.status).toBe("ACTIVE");
    expect(alert.type).toBe("FIRE");
    expect(alert.flatLabel).toBe(`EM-${runId}-EM-101`);
    expect(alert.raisedBy.id).toBe(resident.id);

    // A neighbour, the gate, and the office all hear it.
    for (const recipient of [neighbour, guard, admin]) {
      const got = await notificationsFor(recipient.id, "EMERGENCY_RAISED");
      expect(got).toHaveLength(1);
      expect(got[0]!.body).toContain("Smoke in the stairwell");
      expect((got[0]!.data as Record<string, string>).emergencyId).toBe(alert.id);
    }

    // Not the raiser — they know.
    expect(await notificationsFor(resident.id, "EMERGENCY_RAISED")).toHaveLength(0);
    // Not another society.
    expect(await notificationsFor(outsider.id, "EMERGENCY_RAISED")).toHaveLength(0);
  });

  it("lets a guard raise one, with no flat attached", async () => {
    const alert = await emergencyService.raiseEmergency(guard, { type: "SECURITY" });
    expect(alert.flatLabel).toBeNull();
    expect(alert.raisedBy.id).toBe(guard.id);
    expect(alert.status).toBe("ACTIVE");
  });

  it("collapses a repeated alarm onto the live one instead of raising a second", async () => {
    await clearNotifications();
    const first = await emergencyService.raiseEmergency(admin, { type: "MEDICAL" });
    // What a double-tap, or a shake that fires twice, produces.
    const second = await emergencyService.raiseEmergency(admin, { type: "MEDICAL" });

    expect(second.id).toBe(first.id);
    // The society is told once, not twice.
    expect(await notificationsFor(neighbour.id, "EMERGENCY_RAISED")).toHaveLength(1);
  });

  it("treats a different type as a genuinely new incident", async () => {
    const fire = await emergencyService.raiseEmergency(neighbour, { type: "FIRE" });
    const medical = await emergencyService.raiseEmergency(neighbour, { type: "MEDICAL" });
    expect(medical.id).not.toBe(fire.id);
  });

  it("refuses when the account has no society", async () => {
    const stray = await prisma.user.create({
      data: {
        name: "Emg Stray",
        email: `emg-stray-${runId}@test.local`,
        passwordHash: "unused",
        role: "RESIDENT",
      },
    });
    await expectTRPCError(
      emergencyService.raiseEmergency(stray, { type: "OTHER" }),
      "PRECONDITION_FAILED",
    );
    await prisma.user.delete({ where: { id: stray.id } });
  });
});

describe("resolve", () => {
  it("lets any member stand down an alarm they did not raise", async () => {
    const alert = await emergencyService.raiseEmergency(resident, { type: "SECURITY" });
    await clearNotifications();

    // A neighbour — not an admin, not the raiser — sounds the all-clear.
    const resolved = await emergencyService.resolveEmergency(neighbour, {
      emergencyId: alert.id,
    });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedBy?.id).toBe(neighbour.id);
    expect(resolved.resolvedAt).toBeTruthy();

    // The all-clear reaches the raiser, who most wants to know.
    expect(await notificationsFor(resident.id, "EMERGENCY_RESOLVED")).toHaveLength(1);
  });

  it("rejects a second resolve", async () => {
    const alert = await emergencyService.raiseEmergency(guard, { type: "OTHER" });
    await emergencyService.resolveEmergency(admin, { emergencyId: alert.id });
    await expectTRPCError(
      emergencyService.resolveEmergency(resident, { emergencyId: alert.id }),
      "CONFLICT",
    );
  });

  it("will not reach into another society's alarm", async () => {
    const alert = await emergencyService.raiseEmergency(resident, { type: "MEDICAL" });
    await expectTRPCError(
      emergencyService.resolveEmergency(outsider, { emergencyId: alert.id }),
      "NOT_FOUND",
    );
  });
});

describe("listing", () => {
  it("active lists only live alarms of the caller's society", async () => {
    const live = await emergencyService.raiseEmergency(neighbour, { type: "SECURITY" });

    const active = await emergencyService.listActiveEmergencies(guard);
    expect(active.map((a) => a.id)).toContain(live.id);
    expect(active.every((a) => a.status === "ACTIVE")).toBe(true);

    await emergencyService.resolveEmergency(guard, { emergencyId: live.id });
    const after = await emergencyService.listActiveEmergencies(guard);
    expect(after.map((a) => a.id)).not.toContain(live.id);

    // Another society sees none of ours.
    const theirs = await emergencyService.listActiveEmergencies(outsider);
    expect(theirs).toHaveLength(0);
  });

  it("history pages newest-first and filters by status", async () => {
    const { items } = await emergencyService.listEmergencies(admin, { limit: 100 });
    expect(items.length).toBeGreaterThan(1);
    // Newest first.
    const times = items.map((a) => new Date(a.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const resolved = await emergencyService.listEmergencies(admin, {
      limit: 100,
      status: "RESOLVED",
    });
    expect(resolved.items.every((a) => a.status === "RESOLVED")).toBe(true);
  });
});
