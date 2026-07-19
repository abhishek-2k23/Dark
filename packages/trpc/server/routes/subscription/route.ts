import { subscriptionService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const planPath = generatePath("v1/plans");
const subPath = generatePath("v1/subscription");

/**
 * A society's own subscription to Portl. Admin-only throughout — residents
 * never see billing, and are never affected when it lapses.
 */

const SubscriptionStatusEnum = z
  .enum(["NONE", "TRIALING", "ACTIVE", "GRACE", "EXPIRED", "CANCELLED"])
  .describe(
    "NONE = never subscribed. GRACE = period ended but full access continues, so a failed " +
      "card does not lock a paying society out. EXPIRED = grace ran out and admin changes " +
      "are paused; residents keep working either way",
  );

const PlanModel = z
  .object({
    id: z.string().describe("Plan id"),
    code: z.string().describe("Stable machine key, e.g. 'starter'"),
    name: z.string().describe("Display name"),
    description: z.string().nullable().describe("One-line pitch"),
    price: z.number().describe("Price for one billing interval, in rupees"),
    intervalMonths: z.number().describe("Billing period length in months; 1 = monthly"),
    features: z.array(z.string()).describe("Bullet points for the plan card"),
    maxFlats: z.number().nullable().describe("Soft cap on flats; null = unlimited"),
    isCurrent: z.boolean().describe("Whether this is the society's current plan"),
  })
  .describe("A purchasable subscription plan");

const SubscriptionModel = z
  .object({
    id: z.string().nullable().describe("Subscription id; null if never subscribed"),
    status: SubscriptionStatusEnum,
    planName: z.string().nullable().describe("Current plan name"),
    planCode: z.string().nullable().describe("Current plan code"),
    price: z.number().nullable().describe("Current plan price per interval"),
    intervalMonths: z.number().nullable().describe("Current plan interval in months"),
    currentPeriodStart: z.string().nullable().describe("ISO start of the paid window"),
    currentPeriodEnd: z.string().nullable().describe("ISO end of the paid window"),
    graceEndsAt: z.string().nullable().describe("ISO time grace turns into expiry"),
    cancelledAt: z.string().nullable().describe("ISO time the admin cancelled, if they did"),
    daysRemaining: z.number().nullable().describe("Whole days until the period ends; negative once past"),
    writable: z.boolean().describe("Whether admin changes are currently allowed"),
  })
  .describe("A society's subscription state");

const SubscriptionPaymentModel = z
  .object({
    id: z.string().describe("Payment id"),
    planName: z.string().describe("Plan that was bought"),
    amount: z.number().describe("Amount charged"),
    status: z.string().describe("INITIATED / SUCCESS / FAILED"),
    paidAt: z.string().nullable().describe("ISO time the payment was captured"),
    periodStart: z.string().nullable().describe("ISO start of the window this bought"),
    periodEnd: z.string().nullable().describe("ISO end of the window this bought"),
    razorpayPaymentId: z.string().nullable().describe("Razorpay's payment id, once captured"),
    createdAt: z.string().describe("ISO time checkout was started"),
  })
  .describe("One subscription charge");

export const planRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: planPath(""),
        tags: ["Billing"],
        summary: "List subscription plans",
        description:
          "Active plans in display order, each flagged with whether it is the society's " +
          "current one. Admin-only. Errors: 403 if not an admin, 412 if the account has no " +
          "society.",
        protect: true,
      },
    })
    .input(z.object({}))
    .output(z.array(PlanModel))
    .query(({ ctx }) => subscriptionService.listPlans(ctx.user)),
});

export const subscriptionRouter = router({
  get: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: subPath(""),
        tags: ["Billing"],
        summary: "The society's current subscription",
        description:
          "Current plan, paid-through date, days remaining, and whether admin changes are " +
          "currently allowed. A society that has never subscribed returns status NONE and " +
          "remains writable — onboarding and billing are separate concerns. Errors: 403 if " +
          "not an admin, 412 if the account has no society.",
        protect: true,
      },
    })
    .input(z.object({}))
    .output(SubscriptionModel)
    .query(({ ctx }) => subscriptionService.getSubscription(ctx.user)),

  checkout: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: subPath("checkout"),
        tags: ["Billing"],
        summary: "Start a plan purchase",
        description:
          "Creates a Razorpay order and returns what the client SDK needs to open checkout. " +
          "This is an ordinary merchant sale — the society pays Portl for the software — so " +
          "no Route or linked account is involved. The subscription itself changes only when " +
          "the webhook confirms capture, so an abandoned checkout leaves everything as it " +
          "was. Errors: 400 for a free plan, 403 if not an admin, 404 if the plan is unknown " +
          "or inactive, 412 if payments are not configured on this server.",
        protect: true,
      },
    })
    .input(z.object({ planId: z.string().describe("Id of the plan to buy") }))
    .output(
      z.object({
        subscriptionPaymentId: z.string().describe("Our payment row id"),
        orderId: z.string().describe("Razorpay order id"),
        keyId: z.string().describe("Razorpay publishable key for the client SDK"),
        amount: z.number().describe("Amount to charge, in rupees"),
        currency: z.literal("INR").describe("Always INR"),
        planName: z.string().describe("Plan being bought"),
      }),
    )
    .mutation(({ ctx, input }) => subscriptionService.createCheckout(ctx.user, input)),

  verify: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: subPath("verify"),
        tags: ["Billing"],
        summary: "Confirm a checkout the client just completed",
        description:
          "Called by the app with the handoff Razorpay's checkout SDK returns on success. The " +
          "signature is an HMAC of 'order_id|payment_id' with our key secret, which only the " +
          "server holds, so a client cannot forge it. This is a fast path for immediate UI " +
          "feedback, NOT the source of truth — a client that closes the app mid-payment never " +
          "calls it and the webhook settles that case anyway. Both routes run the same " +
          "activation and whichever arrives second is a no-op. Errors: 401 if the signature " +
          "does not verify, 403 if not an admin, 404 if the order is unknown or belongs to " +
          "another society.",
        protect: true,
      },
    })
    .input(
      z.object({
        orderId: z.string().describe("razorpay_order_id from the checkout callback"),
        paymentId: z.string().describe("razorpay_payment_id from the checkout callback"),
        signature: z.string().describe("razorpay_signature from the checkout callback"),
      }),
    )
    .output(SubscriptionModel)
    .mutation(({ ctx, input }) => subscriptionService.verifyCheckout(ctx.user, input)),

  history: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: subPath("payments"),
        tags: ["Billing"],
        summary: "Subscription payment history",
        description:
          "Every charge against the society's subscription, newest first, including failed " +
          "and abandoned attempts. Cursor-paginated. Errors: 403 if not an admin, 412 if the " +
          "account has no society.",
        protect: true,
      },
    })
    .input(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
        cursor: z.string().describe("Id of the last payment from the previous page").optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(SubscriptionPaymentModel).describe("Payments on this page"),
        nextCursor: z.string().nullable().describe("Cursor for the next page, or null"),
      }),
    )
    .query(({ ctx, input }) => subscriptionService.paymentHistory(ctx.user, input)),

  cancel: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: subPath("cancel"),
        tags: ["Billing"],
        summary: "Cancel at the end of the paid period",
        description:
          "Deliberately not immediate: the society paid for the current window and keeps it " +
          "to the end. Nothing is refunded and nothing is cut short. Errors: 403 if not an " +
          "admin, 404 if there is no subscription, 409 if it is already cancelled.",
        protect: true,
      },
    })
    .input(z.object({}))
    .output(SubscriptionModel)
    .mutation(({ ctx }) => subscriptionService.cancelSubscription(ctx.user)),
});
