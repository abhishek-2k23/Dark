import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as dueService from "./due.service";
import * as paymentService from "./payment.service";

const runId = `du-${Date.now().toString(36)}`;

let societyId: string;
let flatAId: string;
let admin: User;
let residentA: User;
let residentB: User;
let guard: User;

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
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";

  const society = await prisma.society.create({
    data: {
      name: `DU Society ${runId}`,
      address: "1 DU St",
      city: "Testville",
      state: "TS",
      pincode: "000001",
    },
  });
  societyId = society.id;
  const tower = await prisma.tower.create({ data: { societyId, name: `DU-${runId}` } });
  const flatA = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "DU-101", floor: 1, type: "TWO_BHK" },
  });
  flatAId = flatA.id;
  const flatB = await prisma.flat.create({
    data: { towerId: tower.id, flatNumber: "DU-102", floor: 1, type: "TWO_BHK" },
  });

  const mkUser = (name: string, role: "GUARD" | "RESIDENT" | "ADMIN", flatId?: string) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/ /g, "-")}-${runId}@test.local`,
        passwordHash: "unused",
        role,
        societyId,
        ...(flatId ? { residentProfile: { create: { flatId } } } : {}),
      },
    });

  admin = await mkUser("DU Admin", "ADMIN");
  residentA = await mkUser("DU Resident A", "RESIDENT", flatAId);
  residentB = await mkUser("DU Resident B", "RESIDENT", flatB.id);
  guard = await mkUser("DU Guard", "GUARD");
});

afterAll(async () => {
  await prisma.payment.deleteMany({
    where: { due: { flat: { tower: { societyId } } } },
  });
  await prisma.maintenanceDue.deleteMany({ where: { flat: { tower: { societyId } } } });
  const users = await prisma.user.findMany({ where: { societyId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await prisma.residentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.flat.deleteMany({ where: { tower: { societyId } } });
  await prisma.tower.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
  await prisma.$disconnect();
});

describe("due generation", () => {
  it("creates one due per flat, and re-running skips existing ones", async () => {
    const first = await dueService.generateMonthly(admin, {
      month: 3,
      year: 2030,
      amount: 2500,
    });
    expect(first).toEqual({ created: 2, skipped: 0 });

    const rerun = await dueService.generateMonthly(admin, {
      month: 3,
      year: 2030,
      amount: 2500,
    });
    expect(rerun).toEqual({ created: 0, skipped: 2 });
  });

  it("defaults dueDate to the 10th of the billing month", async () => {
    const due = await prisma.maintenanceDue.findFirst({
      where: { flatId: flatAId, month: 3, year: 2030 },
    });
    expect(due?.dueDate.toISOString()).toBe("2030-03-10T00:00:00.000Z");
  });

  it("residents list only their flat's dues; admins the society's; guards get 403", async () => {
    const mine = await dueService.listDues(residentA, { limit: 50 });
    expect(mine.items.every((d) => d.flatId === flatAId)).toBe(true);
    expect(mine.items.length).toBe(1);

    const all = await dueService.listDues(admin, { limit: 50 });
    expect(all.items.length).toBe(2);

    await expectTRPCError(dueService.listDues(guard, { limit: 50 }), "FORBIDDEN");
  });

  it("markOverdueDues flips only past-dueDate PENDING dues", async () => {
    await dueService.generateMonthly(admin, {
      month: 1,
      year: 2020,
      amount: 1000,
      dueDate: "2020-01-10T00:00:00.000Z",
    });
    const flipped = await dueService.markOverdueDues();
    expect(flipped).toBeGreaterThanOrEqual(2);

    const overdue = await dueService.listDues(admin, {
      status: "OVERDUE",
      year: 2020,
      limit: 50,
    });
    expect(overdue.items.length).toBe(2);

    const future = await dueService.listDues(admin, { year: 2030, limit: 50 });
    expect(future.items.every((d) => d.status === "PENDING")).toBe(true);
  });
});

describe("payment flow", () => {
  let dueId: string;
  let paymentId: string;

  beforeAll(async () => {
    const due = await prisma.maintenanceDue.findFirst({
      where: { flatId: flatAId, month: 3, year: 2030 },
    });
    dueId = due!.id;
  });

  it("resident initiates a payment for their own due and gets a mock session", async () => {
    const { payment, gateway } = await paymentService.initiatePayment(residentA, {
      dueId,
      method: "UPI",
    });
    paymentId = payment.id;
    expect(payment.status).toBe("INITIATED");
    expect(payment.amount).toBe(2500);
    expect(gateway.provider).toBe("MOCK");
    expect(gateway.orderId).toContain(payment.id);
  });

  it("a resident cannot pay another flat's due", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(residentB, { dueId, method: "UPI" }),
      "NOT_FOUND",
    );
  });

  it("webhook with a bad signature is rejected", async () => {
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.success",
        paymentId,
        transactionId: `txn-${runId}`,
        signature: "f".repeat(64),
      }),
      "UNAUTHORIZED",
    );
    const untouched = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(untouched?.status).toBe("INITIATED");
  });

  it("payment.success marks the payment SUCCESS and the due PAID", async () => {
    const txn = `txn-${runId}`;
    const result = await paymentService.handleWebhook({
      event: "payment.success",
      paymentId,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.success",
        paymentId,
        transactionId: txn,
      }),
    });
    expect(result).toEqual({ paymentStatus: "SUCCESS", dueStatus: "PAID" });

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.paidAt).not.toBeNull();
    expect(payment?.transactionId).toBe(txn);
  });

  it("replaying the same webhook is an idempotent no-op", async () => {
    const txn = `txn-${runId}`;
    const before = await prisma.payment.findUnique({ where: { id: paymentId } });

    const replay = await paymentService.handleWebhook({
      event: "payment.success",
      paymentId,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.success",
        paymentId,
        transactionId: txn,
      }),
    });
    expect(replay).toEqual({ paymentStatus: "SUCCESS", dueStatus: "PAID" });

    const after = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(after?.paidAt?.toISOString()).toBe(before?.paidAt?.toISOString());
  });

  it("a conflicting event for a terminal payment is rejected", async () => {
    const txn = `txn-${runId}`;
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.failed",
        paymentId,
        transactionId: txn,
        signature: paymentService.signWebhookPayload({
          event: "payment.failed",
          paymentId,
          transactionId: txn,
        }),
      }),
      "CONFLICT",
    );
  });

  it("initiating a payment for a PAID due is rejected", async () => {
    await expectTRPCError(
      paymentService.initiatePayment(residentA, { dueId, method: "CARD" }),
      "CONFLICT",
    );
  });

  it("payment.failed marks the payment FAILED and leaves the due payable", async () => {
    const dueB = await prisma.maintenanceDue.findFirst({
      where: { flat: { flatNumber: "DU-102" }, month: 3, year: 2030 },
    });
    const { payment } = await paymentService.initiatePayment(residentB, {
      dueId: dueB!.id,
      method: "NETBANKING",
    });

    const txn = `txn-fail-${runId}`;
    const result = await paymentService.handleWebhook({
      event: "payment.failed",
      paymentId: payment.id,
      transactionId: txn,
      signature: paymentService.signWebhookPayload({
        event: "payment.failed",
        paymentId: payment.id,
        transactionId: txn,
      }),
    });
    expect(result.paymentStatus).toBe("FAILED");
    expect(result.dueStatus).toBe("PENDING");

    // The due can still be paid with a fresh attempt.
    const retry = await paymentService.initiatePayment(residentB, {
      dueId: dueB!.id,
      method: "UPI",
    });
    expect(retry.payment.status).toBe("INITIATED");
  });

  it("webhook for an unknown payment is NOT_FOUND", async () => {
    const txn = "txn-ghost";
    await expectTRPCError(
      paymentService.handleWebhook({
        event: "payment.success",
        paymentId: "ghost-payment",
        transactionId: txn,
        signature: paymentService.signWebhookPayload({
          event: "payment.success",
          paymentId: "ghost-payment",
          transactionId: txn,
        }),
      }),
      "NOT_FOUND",
    );
  });

  it("history lists every attempt of the caller, newest first", async () => {
    const history = await paymentService.paymentHistory(residentB, { limit: 50 });
    expect(history.items.length).toBe(2); // the FAILED attempt and the retry; rejected initiations create no row
    const statuses = history.items.map((p) => p.status);
    expect(statuses).toContain("FAILED");
    expect(statuses).toContain("INITIATED");

    const historyA = await paymentService.paymentHistory(residentA, { limit: 50 });
    expect(historyA.items.length).toBe(1);
    expect(historyA.items[0]!.status).toBe("SUCCESS");
  });
});
