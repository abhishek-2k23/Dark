import { TRPCError } from "@trpc/server";
import {
  prisma,
  type Prisma,
  type User,
  type SubscriptionStatus,
} from "@repo/database";
import { logger } from "@repo/logger";

import * as razorpay from "../dues/razorpay";
import { notifyUsers, societyAdminUserIds } from "../notification/notification.service";

/**
 * A society's subscription to Portl.
 *
 * This is the one place money flows *to us*, which makes it structurally
 * different from every other payment in the app: we are the merchant selling
 * our own software, so it is a plain Razorpay checkout with no Route, no
 * linked accounts, and none of the payment-aggregator constraints that shape
 * resident payments (see docs/payments.md).
 *
 * Only society admins ever see or touch this. Residents are unaffected by it
 * entirely — including when it lapses.
 */

/** How long a lapsed subscription keeps full access before turning read-only. */
const GRACE_DAYS = 7;
/** How far ahead of expiry admins start being warned. */
const EXPIRY_WARNING_DAYS = 7;

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanInfo {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  intervalMonths: number;
  features: string[];
  maxFlats: number | null;
  isCurrent: boolean;
}

export async function listPlans(actor: User): Promise<PlanInfo[]> {
  const societyId = actorSocietyId(actor);
  const [plans, subscription] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.subscription.findUnique({ where: { societyId }, select: { planId: true } }),
  ]);

  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    intervalMonths: p.intervalMonths,
    features: p.features,
    maxFlats: p.maxFlats,
    isCurrent: subscription?.planId === p.id,
  }));
}

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export interface SubscriptionInfo {
  id: string | null;
  status: SubscriptionStatus | "NONE";
  planName: string | null;
  planCode: string | null;
  price: number | null;
  intervalMonths: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelledAt: string | null;
  /** Whole days until the paid period ends; negative once it has. */
  daysRemaining: number | null;
  /** Whether admin writes are currently allowed. */
  writable: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Admin write access. EXPIRED is the only status that blocks — grace exists
 * precisely so a failed card does not lock a paying customer out, and a
 * cancelled subscription runs to the end of the period it already paid for.
 */
export function isWritable(status: SubscriptionStatus | "NONE"): boolean {
  return status !== "EXPIRED";
}

export async function getSubscription(actor: User): Promise<SubscriptionInfo> {
  const societyId = actorSocietyId(actor);
  const sub = await prisma.subscription.findUnique({
    where: { societyId },
    include: { plan: true },
  });

  if (!sub) {
    // A society that has never subscribed is not blocked — onboarding a
    // society and billing it are separate concerns, and locking one out
    // before it has ever seen a plan would be absurd.
    return {
      id: null,
      status: "NONE",
      planName: null,
      planCode: null,
      price: null,
      intervalMonths: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      cancelledAt: null,
      daysRemaining: null,
      writable: true,
    };
  }

  return {
    id: sub.id,
    status: sub.status,
    planName: sub.plan.name,
    planCode: sub.plan.code,
    price: Number(sub.plan.price),
    intervalMonths: sub.plan.intervalMonths,
    currentPeriodStart: sub.currentPeriodStart.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
    cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    daysRemaining: daysBetween(new Date(), sub.currentPeriodEnd),
    writable: isWritable(sub.status),
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutSession {
  subscriptionPaymentId: string;
  orderId: string;
  keyId: string;
  amount: number;
  currency: "INR";
  planName: string;
}

/**
 * Start a purchase. Creates a Razorpay order and a matching
 * SubscriptionPayment row; the subscription itself is only touched once the
 * webhook confirms capture, so an abandoned checkout changes nothing.
 */
export async function createCheckout(
  actor: User,
  input: { planId: string },
): Promise<CheckoutSession> {
  const societyId = actorSocietyId(actor);

  if (!razorpay.isConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Payments are not configured on this server",
    });
  }

  const plan = await prisma.plan.findFirst({ where: { id: input.planId, isActive: true } });
  if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
  if (Number(plan.price) <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This plan is free and needs no payment",
    });
  }

  // A subscription row must exist before a payment can point at it. A society
  // buying for the first time gets one in TRIALING with a period that has
  // already ended — it becomes real only when the webhook lands.
  const now = new Date();
  const subscription = await prisma.subscription.upsert({
    where: { societyId },
    update: {},
    create: {
      societyId,
      planId: plan.id,
      status: "TRIALING",
      currentPeriodStart: now,
      currentPeriodEnd: now,
    },
  });

  const order = await razorpay.createOrder({
    amountRupees: Number(plan.price),
    receipt: `sub_${subscription.id}_${Date.now()}`,
    notes: { societyId, subscriptionId: subscription.id, planId: plan.id },
  });

  const payment = await prisma.subscriptionPayment.create({
    data: {
      subscriptionId: subscription.id,
      planId: plan.id,
      amount: plan.price,
      razorpayOrderId: order.id,
    },
  });

  return {
    subscriptionPaymentId: payment.id,
    orderId: order.id,
    keyId: process.env.RAZORPAY_KEY_ID!,
    amount: Number(plan.price),
    currency: "INR",
    planName: plan.name,
  };
}

// ---------------------------------------------------------------------------
// Payment history
// ---------------------------------------------------------------------------

export interface SubscriptionPaymentInfo {
  id: string;
  planName: string;
  amount: number;
  status: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
}

export async function paymentHistory(
  actor: User,
  input: { limit: number; cursor?: string },
): Promise<{ items: SubscriptionPaymentInfo[]; nextCursor: string | null }> {
  const societyId = actorSocietyId(actor);

  const payments = await prisma.subscriptionPayment.findMany({
    where: { subscription: { societyId } },
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: { plan: { select: { name: true } } },
  });

  const hasMore = payments.length > input.limit;
  const items = (hasMore ? payments.slice(0, input.limit) : payments).map((p) => ({
    id: p.id,
    planName: p.plan.name,
    amount: Number(p.amount),
    status: p.status,
    paidAt: p.paidAt?.toISOString() ?? null,
    periodStart: p.periodStart?.toISOString() ?? null,
    periodEnd: p.periodEnd?.toISOString() ?? null,
    razorpayPaymentId: p.razorpayPaymentId,
    createdAt: p.createdAt.toISOString(),
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/**
 * Cancel at period end. Deliberately not immediate: the society paid for the
 * current window and keeps it. Nothing is refunded and nothing is cut short.
 */
export async function cancelSubscription(actor: User): Promise<SubscriptionInfo> {
  const societyId = actorSocietyId(actor);
  const sub = await prisma.subscription.findUnique({ where: { societyId } });
  if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "No subscription to cancel" });
  if (sub.status === "CANCELLED") {
    throw new TRPCError({ code: "CONFLICT", message: "This subscription is already cancelled" });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return getSubscription(actor);
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Razorpay webhook for subscription purchases.
 *
 * Verified against the RAW request body — a parsed-then-reserialised body
 * changes key order and whitespace and fails every signature check, which is
 * why the Express route captures raw bytes before the JSON parser runs.
 *
 * Deduped on Razorpay's own event id: Razorpay retries deliveries, and payment
 * status alone cannot distinguish a replay from a second legitimate event.
 */
export async function handleRazorpayWebhook(input: {
  rawBody: string;
  signature: string;
}): Promise<{ handled: boolean; event: string }> {
  if (!razorpay.verifyWebhookSignature(input.rawBody, input.signature)) {
    logger.info("Razorpay webhook rejected: bad signature");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
  }

  const payload = JSON.parse(input.rawBody) as {
    event: string;
    id?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  const event = payload.event;
  const entity = payload.payload?.payment?.entity as
    | { id?: string; order_id?: string }
    | undefined;
  const eventId = payload.id ?? `${event}:${entity?.id ?? entity?.order_id ?? "unknown"}`;

  try {
    await prisma.webhookEvent.create({ data: { id: eventId, provider: "RAZORPAY" } });
  } catch {
    logger.info("Razorpay webhook replay ignored", { event, eventId });
    return { handled: false, event };
  }

  if (event !== "payment.captured" && event !== "payment.failed") {
    return { handled: false, event };
  }
  if (!entity?.order_id) return { handled: false, event };

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { razorpayOrderId: entity.order_id },
    include: { subscription: true, plan: true },
  });
  if (!payment) {
    logger.info("Razorpay webhook for unknown subscription order", { orderId: entity.order_id });
    return { handled: false, event };
  }
  if (payment.status !== "INITIATED") {
    return { handled: true, event };
  }

  if (event === "payment.failed") {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", razorpayPaymentId: entity.id },
    });
    return { handled: true, event };
  }

  // Extend from whichever is later: the end of the current paid period, or
  // now. Renewing early must not forfeit days already paid for, and renewing
  // after a lapse must not credit the gap.
  const now = new Date();
  const base =
    payment.subscription.currentPeriodEnd > now ? payment.subscription.currentPeriodEnd : now;
  const periodEnd = addMonths(base, payment.plan.intervalMonths);

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        razorpayPaymentId: entity.id,
        paidAt: now,
        periodStart: base,
        periodEnd,
      },
    });
    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        planId: payment.planId,
        status: "ACTIVE",
        currentPeriodStart: base,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        cancelledAt: null,
      },
    });
  });

  await notifyUsers(await societyAdminUserIds(payment.subscription.societyId), {
    type: "SUBSCRIPTION_ACTIVATED",
    title: "Subscription active",
    body: `Your ${payment.plan.name} plan is active until ${periodEnd.toDateString()}.`,
    data: { subscriptionId: payment.subscriptionId },
  });

  return { handled: true, event };
}

// ---------------------------------------------------------------------------
// Lapse sweep
// ---------------------------------------------------------------------------

/**
 * Move lapsed subscriptions along: ACTIVE/CANCELLED past their period end
 * enter GRACE, and GRACE past its window becomes EXPIRED. Runs from the api's
 * periodic sweep.
 *
 * Residents are never affected by any of this — only admin writes are gated,
 * and only at EXPIRED.
 */
export async function sweepSubscriptions(): Promise<{
  warned: number;
  grace: number;
  expired: number;
}> {
  const now = new Date();

  // 1. Warn ahead of expiry, once per subscription per approach.
  const warnBefore = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const expiringSoon = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "CANCELLED"] },
      currentPeriodEnd: { gt: now, lte: warnBefore },
    },
    include: { plan: { select: { name: true } } },
  });
  for (const sub of expiringSoon) {
    await notifyUsers(await societyAdminUserIds(sub.societyId), {
      type: "SUBSCRIPTION_EXPIRING",
      title: "Subscription ending soon",
      body: `Your ${sub.plan.name} plan ends on ${sub.currentPeriodEnd.toDateString()}. Renew to keep admin access.`,
      data: { subscriptionId: sub.id },
    });
  }

  // 2. Period ended → GRACE. graceEndsAt is stamped now so the window is fixed
  //    at this moment rather than recomputed from a config that may change.
  const lapsed = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "CANCELLED"] }, currentPeriodEnd: { lte: now } },
    select: { id: true },
  });
  if (lapsed.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: lapsed.map((s) => s.id) } },
      data: {
        status: "GRACE",
        graceEndsAt: new Date(now.getTime() + GRACE_DAYS * 86_400_000),
      },
    });
  }

  // 3. Grace ran out → EXPIRED.
  const expiredNow = await prisma.subscription.findMany({
    where: { status: "GRACE", graceEndsAt: { lte: now } },
    select: { id: true, societyId: true },
  });
  if (expiredNow.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: expiredNow.map((s) => s.id) } },
      data: { status: "EXPIRED" },
    });
    for (const sub of expiredNow) {
      await notifyUsers(await societyAdminUserIds(sub.societyId), {
        type: "SUBSCRIPTION_EXPIRED",
        title: "Subscription expired",
        body: "Admin changes are paused until you renew. Residents are unaffected and your data is safe.",
        data: { subscriptionId: sub.id },
      });
    }
  }

  return { warned: expiringSoon.length, grace: lapsed.length, expired: expiredNow.length };
}

/**
 * Whether this society's admins may currently make changes. Used by the tRPC
 * middleware that gates admin mutations.
 */
export async function societyWritable(societyId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { societyId },
    select: { status: true },
  });
  return isWritable(sub?.status ?? "NONE");
}
