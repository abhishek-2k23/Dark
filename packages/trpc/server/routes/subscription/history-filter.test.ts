import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, type User } from "@repo/database";

import { serverRouter } from "../../index";
import { tRPCContext } from "../../trpc";

/**
 * The payment-history status filter, exercised through the router rather than
 * the service.
 *
 * The service-level tests already prove the Prisma query filters correctly, so
 * what is left to cover is everything between the wire and that query: the Zod
 * input schema, and whether `status` survives it. `z.object()` strips unknown
 * keys silently, so a field missing from the schema does not error — it just
 * quietly stops filtering and the caller gets the whole history back. That is
 * exactly the failure this guards.
 */

const runId = `hf-${Math.random().toString(36).slice(2, 10)}`;
const createCaller = tRPCContext.createCallerFactory(serverRouter);

let admin: User;
let societyId: string;
let planId: string;
let subscriptionId: string;

/** `unconfigured` = no FIREBASE_PROJECT_NUMBER, so the guard lets the call through. */
const callerForAdmin = () =>
  createCaller({ prisma, user: admin, appCheck: { status: "unconfigured" } });

beforeAll(async () => {
  const society = await prisma.society.create({
    data: {
      name: `HF Society ${runId}`,
      address: "1 Test Road",
      city: "Test",
      state: "Test",
      pincode: "560001",
    },
  });
  societyId = society.id;

  admin = await prisma.user.create({
    data: {
      name: "HF Admin",
      email: `hf-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });

  const plan = await prisma.plan.create({
    data: {
      code: `hf-plan-${runId}`,
      name: "HF Plan",
      price: 999,
      intervalMonths: 1,
      sortOrder: 900,
      isActive: true,
      features: ["a"],
    },
  });
  planId = plan.id;

  const sub = await prisma.subscription.create({
    data: {
      societyId,
      planId,
      status: "ACTIVE",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      activatedAt: new Date(),
    },
  });
  subscriptionId = sub.id;

  // One of each outcome, so a filter that silently does nothing is visible.
  const statuses = ["INITIATED", "SUCCESS", "FAILED"] as const;
  for (const [i, status] of statuses.entries()) {
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        planId,
        amount: 999,
        razorpayOrderId: `order_${runId}_${i}`,
        status,
        ...(status === "SUCCESS" ? { paidAt: new Date() } : {}),
      },
    });
  }
});

afterAll(async () => {
  await prisma.subscriptionPayment.deleteMany({ where: { subscriptionId } });
  await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.user.deleteMany({ where: { id: admin.id } });
  await prisma.society.deleteMany({ where: { id: societyId } });
});

describe("subscription.history status filter, through the router", () => {
  it("returns every outcome when unfiltered", async () => {
    const caller = callerForAdmin();
    const res = await caller.subscription.history({ limit: 50 });
    expect(new Set(res.items.map((p) => p.status))).toEqual(
      new Set(["INITIATED", "SUCCESS", "FAILED"]),
    );
  });

  it.each(["INITIATED", "SUCCESS", "FAILED"] as const)(
    "returns only %s when filtered to it",
    async (status) => {
      const caller = callerForAdmin();
      const res = await caller.subscription.history({ limit: 50, status });
      expect(res.items.length).toBe(1);
      expect(res.items.map((p) => p.status)).toEqual([status]);
    },
  );

  it("keeps the filter applied across a paginated page boundary", async () => {
    // A second FAILED row, so FAILED spans two pages at limit 1.
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        planId,
        amount: 999,
        razorpayOrderId: `order_${runId}_extra`,
        status: "FAILED",
      },
    });

    const caller = callerForAdmin();
    const first = await caller.subscription.history({ limit: 1, status: "FAILED" });
    expect(first.items.map((p) => p.status)).toEqual(["FAILED"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await caller.subscription.history({
      limit: 1,
      status: "FAILED",
      cursor: first.nextCursor!,
    });
    // The page-two row is where a dropped filter would show up as a stray
    // INITIATED/SUCCESS card appearing under "Failed".
    expect(second.items.map((p) => p.status)).toEqual(["FAILED"]);
  });
});
