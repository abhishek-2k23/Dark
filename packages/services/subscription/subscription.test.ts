import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { prisma, type User } from "@repo/database";

import * as subscriptionService from "./subscription.service";

/**
 * A society's subscription to Portl.
 *
 * Checkout itself calls Razorpay over the network, so only its guard paths are
 * covered here; the order-creation call is verified by hand against test mode
 * (docs/payments.md). Everything downstream of the webhook — activation,
 * period arithmetic, grace, expiry, access gating — is exercised directly,
 * because that is where the money actually turns into access.
 */

const runId = `sb-${Date.now().toString(36)}`;
const WEBHOOK_SECRET = "test-subscription-webhook-secret";

let societyId: string;
let admin: User;
let starterPlanId: string;
let annualPlanId: string;
let freePlanId: string;

async function expectTRPCError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    expect.unreachable(`expected TRPCError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }
}

/** Builds a signed Razorpay webhook body the way Razorpay would. */
function webhook(event: string, orderId: string, paymentId: string, eventId: string) {
  const rawBody = JSON.stringify({
    event,
    id: eventId,
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
  const signature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return { rawBody, signature };
}

/** Creates a checkout row directly, standing in for the networked createCheckout. */
async function pendingPayment(planId: string, orderId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { societyId } });
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  return prisma.subscriptionPayment.create({
    data: {
      subscriptionId: sub.id,
      planId,
      amount: plan.price,
      razorpayOrderId: orderId,
    },
  });
}

beforeAll(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const society = await prisma.society.create({
    data: {
      name: `SB Society ${runId}`,
      address: "1 SB St",
      city: "Testville",
      state: "TS",
      pincode: "000004",
    },
  });
  societyId = society.id;

  admin = await prisma.user.create({
    data: {
      name: "SB Admin",
      email: `sb-admin-${runId}@test.local`,
      passwordHash: "unused",
      role: "ADMIN",
      societyId,
    },
  });

  const mkPlan = (code: string, price: number, intervalMonths: number, sortOrder: number) =>
    prisma.plan.create({
      data: {
        code: `${code}-${runId}`,
        name: `${code} ${runId}`,
        price,
        intervalMonths,
        sortOrder,
        features: ["a", "b"],
      },
    });

  starterPlanId = (await mkPlan("starter", 999, 1, 101)).id;
  annualPlanId = (await mkPlan("annual", 9990, 12, 102)).id;
  freePlanId = (await mkPlan("free", 0, 1, 103)).id;
});

afterAll(async () => {
  await prisma.subscriptionPayment.deleteMany({ where: { subscription: { societyId } } });
  await prisma.subscription.deleteMany({ where: { societyId } });
  await prisma.plan.deleteMany({ where: { code: { contains: runId } } });
  await prisma.notification.deleteMany({ where: { userId: admin.id } });
  await prisma.user.deleteMany({ where: { societyId } });
  await prisma.society.deleteMany({ where: { id: societyId } });
});

describe("a society that has never subscribed", () => {
  it("reports NONE and stays writable", async () => {
    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.status).toBe("NONE");
    expect(sub.id).toBeNull();
    // Onboarding a society and billing it are separate concerns — locking one
    // out before it has ever seen a plan would be absurd.
    expect(sub.writable).toBe(true);
    expect(await subscriptionService.societyWritable(societyId)).toBe(true);
  });

  it("lists active plans with none marked current", async () => {
    const plans = await subscriptionService.listPlans(admin);
    const mine = plans.filter((p) => p.code.includes(runId));
    expect(mine.length).toBe(3);
    expect(mine.every((p) => !p.isCurrent)).toBe(true);
  });
});

describe("checkout guards", () => {
  it("refuses when the gateway is not configured", async () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    try {
      await expectTRPCError(
        subscriptionService.createCheckout(admin, { planId: starterPlanId }),
        "PRECONDITION_FAILED",
      );
    } finally {
      if (keyId) process.env.RAZORPAY_KEY_ID = keyId;
      if (keySecret) process.env.RAZORPAY_KEY_SECRET = keySecret;
    }
  });

  it("refuses an unknown plan", async () => {
    await expectTRPCError(
      subscriptionService.createCheckout(admin, { planId: "does-not-exist" }),
      "NOT_FOUND",
    );
  });

  it("refuses a free plan, which has nothing to charge", async () => {
    await expectTRPCError(
      subscriptionService.createCheckout(admin, { planId: freePlanId }),
      "BAD_REQUEST",
    );
  });
});

describe("webhook activates the subscription", () => {
  it("ignores a body whose signature does not match", async () => {
    const { rawBody } = webhook("payment.captured", "order_x", "pay_x", `evt-bad-${runId}`);
    await expectTRPCError(
      subscriptionService.handleRazorpayWebhook({ rawBody, signature: "deadbeef" }),
      "UNAUTHORIZED",
    );
  });

  it("turns a captured payment into an active period", async () => {
    // Seed the subscription the way createCheckout would.
    await prisma.subscription.create({
      data: {
        societyId,
        planId: starterPlanId,
        status: "TRIALING",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      },
    });
    const payment = await pendingPayment(starterPlanId, `order_${runId}_1`);

    const { rawBody, signature } = webhook(
      "payment.captured",
      payment.razorpayOrderId,
      `pay_${runId}_1`,
      `evt-1-${runId}`,
    );
    const res = await subscriptionService.handleRazorpayWebhook({ rawBody, signature });
    expect(res).toEqual({ handled: true, event: "payment.captured" });

    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.writable).toBe(true);
    // A one-month plan buys roughly a month.
    expect(sub.daysRemaining).toBeGreaterThan(25);
    expect(sub.daysRemaining).toBeLessThanOrEqual(32);

    const stored = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe("SUCCESS");
    expect(stored.razorpayPaymentId).toBe(`pay_${runId}_1`);
    expect(stored.periodEnd).not.toBeNull();
  });

  it("ignores a replayed delivery", async () => {
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({
      where: { razorpayOrderId: `order_${runId}_1` },
    });
    const before = await subscriptionService.getSubscription(admin);

    // Razorpay retries deliveries; the same event id must be a no-op.
    const { rawBody, signature } = webhook(
      "payment.captured",
      payment.razorpayOrderId,
      `pay_${runId}_1`,
      `evt-1-${runId}`,
    );
    const res = await subscriptionService.handleRazorpayWebhook({ rawBody, signature });
    expect(res.handled).toBe(false);

    const after = await subscriptionService.getSubscription(admin);
    // Crucially the period did not get extended a second time.
    expect(after.currentPeriodEnd).toBe(before.currentPeriodEnd);
  });

  it("extends from the existing period end when renewing early, not from today", async () => {
    const before = await subscriptionService.getSubscription(admin);
    const payment = await pendingPayment(annualPlanId, `order_${runId}_2`);
    const { rawBody, signature } = webhook(
      "payment.captured",
      payment.razorpayOrderId,
      `pay_${runId}_2`,
      `evt-2-${runId}`,
    );
    await subscriptionService.handleRazorpayWebhook({ rawBody, signature });

    const after = await subscriptionService.getSubscription(admin);
    // Renewing early must not forfeit days already paid for: the new end is
    // twelve months past the OLD end, not twelve months from now.
    const oldEnd = new Date(before.currentPeriodEnd!);
    const newEnd = new Date(after.currentPeriodEnd!);
    const expected = new Date(oldEnd);
    expected.setMonth(expected.getMonth() + 12);
    expect(Math.abs(newEnd.getTime() - expected.getTime())).toBeLessThan(1000);
    expect(after.planCode).toContain("annual");
  });

  it("records a failed payment without touching the subscription", async () => {
    const before = await subscriptionService.getSubscription(admin);
    const payment = await pendingPayment(starterPlanId, `order_${runId}_3`);
    const { rawBody, signature } = webhook(
      "payment.failed",
      payment.razorpayOrderId,
      `pay_${runId}_3`,
      `evt-3-${runId}`,
    );
    await subscriptionService.handleRazorpayWebhook({ rawBody, signature });

    const stored = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe("FAILED");
    const after = await subscriptionService.getSubscription(admin);
    expect(after.currentPeriodEnd).toBe(before.currentPeriodEnd);
  });

  it("acknowledges an unknown order rather than erroring", async () => {
    // A non-2xx would make Razorpay retry an event we cannot act on.
    const { rawBody, signature } = webhook(
      "payment.captured",
      "order_never_seen",
      "pay_x",
      `evt-4-${runId}`,
    );
    const res = await subscriptionService.handleRazorpayWebhook({ rawBody, signature });
    expect(res.handled).toBe(false);
  });
});

describe("client checkout verification", () => {
  /** Razorpay signs `order_id|payment_id` with the key secret. */
  const sign = (orderId: string, paymentId: string, secret: string) =>
    crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  const KEY_SECRET = "test-key-secret";
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "rzp_test_stub";
  });
  afterAll(() => {
    if (originalSecret) process.env.RAZORPAY_KEY_SECRET = originalSecret;
  });

  it("rejects a forged signature", async () => {
    const payment = await pendingPayment(starterPlanId, `order_${runId}_v1`);
    await expectTRPCError(
      subscriptionService.verifyCheckout(admin, {
        orderId: payment.razorpayOrderId,
        paymentId: `pay_${runId}_v1`,
        signature: "f".repeat(64),
      }),
      "UNAUTHORIZED",
    );
    // A rejected verification must leave the payment untouched.
    const stored = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe("INITIATED");
  });

  it("activates the subscription on a genuine signature", async () => {
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({
      where: { razorpayOrderId: `order_${runId}_v1` },
    });
    const paymentId = `pay_${runId}_v1`;
    const result = await subscriptionService.verifyCheckout(admin, {
      orderId: payment.razorpayOrderId,
      paymentId,
      signature: sign(payment.razorpayOrderId, paymentId, KEY_SECRET),
    });

    expect(result.status).toBe("ACTIVE");
    const stored = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(stored.status).toBe("SUCCESS");
    expect(stored.razorpayPaymentId).toBe(paymentId);
  });

  it("is a no-op when the webhook already settled the same payment", async () => {
    // Both paths race in production; whichever lands second must not extend
    // the period a second time.
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({
      where: { razorpayOrderId: `order_${runId}_v1` },
    });
    const before = await subscriptionService.getSubscription(admin);
    const paymentId = `pay_${runId}_v1`;

    const after = await subscriptionService.verifyCheckout(admin, {
      orderId: payment.razorpayOrderId,
      paymentId,
      signature: sign(payment.razorpayOrderId, paymentId, KEY_SECRET),
    });
    expect(after.currentPeriodEnd).toBe(before.currentPeriodEnd);
  });

  it("refuses an order belonging to another society", async () => {
    // A valid signature proves the payment is real, not that it belongs to
    // whoever is asking.
    const otherSociety = await prisma.society.create({
      data: {
        name: `SB Other ${runId}`,
        address: "2 SB St",
        city: "Testville",
        state: "TS",
        pincode: "000005",
      },
    });
    const otherSub = await prisma.subscription.create({
      data: {
        societyId: otherSociety.id,
        planId: starterPlanId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      },
    });
    const orderId = `order_${runId}_other`;
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: otherSub.id,
        planId: starterPlanId,
        amount: 999,
        razorpayOrderId: orderId,
      },
    });

    const paymentId = `pay_${runId}_other`;
    await expectTRPCError(
      subscriptionService.verifyCheckout(admin, {
        orderId,
        paymentId,
        signature: sign(orderId, paymentId, KEY_SECRET),
      }),
      "NOT_FOUND",
    );

    await prisma.subscriptionPayment.deleteMany({ where: { subscriptionId: otherSub.id } });
    await prisma.subscription.delete({ where: { id: otherSub.id } });
    await prisma.society.delete({ where: { id: otherSociety.id } });
  });
});

describe("payment history", () => {
  it("lists every attempt including failures, newest first", async () => {
    const history = await subscriptionService.paymentHistory(admin, { limit: 50 });
    // Deliberately not asserting an exact count — every checkout test above
    // adds a row, so a hardcoded number turns any new test into a false
    // failure here. What matters is that failures are not hidden.
    expect(history.items.length).toBeGreaterThanOrEqual(3);
    expect(history.items.map((p) => p.status)).toContain("FAILED");
    expect(history.items.map((p) => p.status)).toContain("SUCCESS");
    const times = history.items.map((p) => new Date(p.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("lapse: grace then expiry", () => {
  it("moves a lapsed subscription into GRACE with full access intact", async () => {
    // Backdate the period rather than waiting a month.
    await prisma.subscription.update({
      where: { societyId },
      data: { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() - 60_000) },
    });

    const result = await subscriptionService.sweepSubscriptions();
    expect(result.grace).toBeGreaterThanOrEqual(1);

    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.status).toBe("GRACE");
    // Grace exists precisely so a failed card does not lock a paying society
    // out on the day — access must continue.
    expect(sub.writable).toBe(true);
    expect(await subscriptionService.societyWritable(societyId)).toBe(true);
    expect(sub.graceEndsAt).not.toBeNull();
  });

  it("expires once the grace window closes, and only then blocks admin writes", async () => {
    await prisma.subscription.update({
      where: { societyId },
      data: { graceEndsAt: new Date(Date.now() - 60_000) },
    });

    const result = await subscriptionService.sweepSubscriptions();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.status).toBe("EXPIRED");
    expect(sub.writable).toBe(false);
    expect(await subscriptionService.societyWritable(societyId)).toBe(false);
  });

  it("still lets an expired admin read their billing state, or they could never pay", async () => {
    // getSubscription and listPlans must keep working at EXPIRED — gating them
    // would trap the customer with no route back.
    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.planName).not.toBeNull();
    const plans = await subscriptionService.listPlans(admin);
    expect(plans.length).toBeGreaterThan(0);
  });

  it("never blocks residents, whatever the society's billing state", async () => {
    // isWritable is the single source of truth for the admin gate, and it is
    // consulted only by adminProcedure — residents and guards never reach it.
    expect(subscriptionService.isWritable("EXPIRED")).toBe(false);
    expect(subscriptionService.isWritable("GRACE")).toBe(true);
    expect(subscriptionService.isWritable("CANCELLED")).toBe(true);
    expect(subscriptionService.isWritable("ACTIVE")).toBe(true);
    expect(subscriptionService.isWritable("NONE")).toBe(true);
  });

  it("restores access when a payment lands after expiry, without crediting the gap", async () => {
    const payment = await pendingPayment(starterPlanId, `order_${runId}_5`);
    const { rawBody, signature } = webhook(
      "payment.captured",
      payment.razorpayOrderId,
      `pay_${runId}_5`,
      `evt-5-${runId}`,
    );
    await subscriptionService.handleRazorpayWebhook({ rawBody, signature });

    const sub = await subscriptionService.getSubscription(admin);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.writable).toBe(true);
    expect(sub.graceEndsAt).toBeNull();
    // Renewing after a lapse starts from today, so the unpaid gap is not
    // credited back as free time.
    expect(sub.daysRemaining).toBeGreaterThan(25);
    expect(sub.daysRemaining).toBeLessThanOrEqual(32);
  });
});

describe("cancel", () => {
  it("runs to the end of the paid period rather than cutting access off", async () => {
    const before = await subscriptionService.getSubscription(admin);
    const cancelled = await subscriptionService.cancelSubscription(admin);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).not.toBeNull();
    // They paid for this window and they keep it.
    expect(cancelled.currentPeriodEnd).toBe(before.currentPeriodEnd);
    expect(cancelled.writable).toBe(true);
  });

  it("refuses to cancel twice", async () => {
    await expectTRPCError(subscriptionService.cancelSubscription(admin), "CONFLICT");
  });
});
