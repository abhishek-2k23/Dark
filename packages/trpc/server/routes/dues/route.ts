import { dueService, paymentService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, protectedProcedure, publicProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const duePath = generatePath("v1/dues");
const paymentPath = generatePath("v1/payments");

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const DueStatusEnum = z.enum(["PENDING", "PAID", "OVERDUE"]).describe("Due status");

const PaymentMethodEnum = z.enum(["UPI", "CARD", "NETBANKING"]).describe("Payment method");

const PaymentStatusEnum = z
  .enum(["INITIATED", "SUCCESS", "FAILED"])
  .describe("Payment status");

const DueModel = z
  .object({
    id: z.string().describe("Due id"),
    flatId: z.string().describe("Flat the due belongs to"),
    flatNumber: z.string().describe("Flat number"),
    towerName: z.string().describe("Tower name"),
    month: z.number().describe("Billing month, 1–12"),
    year: z.number().describe("Billing year"),
    amount: z.number().describe("Amount due"),
    dueDate: z.string().describe("ISO date payment is due by; PENDING flips to OVERDUE after this"),
    status: DueStatusEnum,
  })
  .describe("A monthly maintenance due for a flat");

const PaymentModel = z
  .object({
    id: z.string().describe("Payment id"),
    dueId: z.string().describe("Due this payment is against"),
    dueMonth: z.number().describe("Billing month of the due"),
    dueYear: z.number().describe("Billing year of the due"),
    amount: z.number().describe("Amount of the payment"),
    method: PaymentMethodEnum,
    transactionId: z.string().nullable().describe("Gateway transaction id, once known"),
    status: PaymentStatusEnum,
    paidAt: z.string().nullable().describe("ISO time the payment succeeded, if it did"),
    createdAt: z.string().describe("ISO time the payment was initiated"),
  })
  .describe("A payment attempt against a due");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const GenerateMonthlyInput = z.object({
  month: z.number().int().min(1).max(12).describe("Billing month, 1–12"),
  year: z.number().int().min(2020).max(2100).describe("Billing year"),
  amount: z.number().positive().describe("Amount to bill each flat"),
  dueDate: z.iso
    .datetime()
    .describe("ISO payment deadline; defaults to the 10th of the billing month")
    .optional(),
});

const ListDuesInput = z.object({
  status: DueStatusEnum.describe("Only dues with this status").optional(),
  month: z.coerce.number().int().min(1).max(12).describe("Only this billing month").optional(),
  year: z.coerce.number().int().describe("Only this billing year").optional(),
  flatId: z
    .string()
    .describe("Only this flat (admins only — residents always see their own flat)")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last due from the previous page").optional(),
});

const InitiatePaymentInput = z.object({
  dueId: z.string().describe("Id of the due to pay"),
  method: PaymentMethodEnum,
});

const WebhookInput = z.object({
  event: z
    .enum(["payment.success", "payment.failed"])
    .describe("Gateway event type"),
  paymentId: z.string().describe("Payment id from the initiate call"),
  transactionId: z.string().min(1).describe("Gateway transaction id"),
  signature: z
    .string()
    .min(1)
    .describe("HMAC-SHA256 hex of 'event:paymentId:transactionId' with the webhook secret"),
});

const HistoryInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last payment from the previous page").optional(),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const dueRouter = router({
  generateMonthly: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: duePath("generate"),
        tags: ["Dues"],
        summary: "Generate the month's dues for every flat",
        description:
          "Creates one PENDING due per flat of the admin's society for the given month/year. " +
          "Idempotent: flats that already have a due for that month are skipped, so re-running " +
          "is safe. Errors: 403 if not an admin.",
        protect: true,
      },
    })
    .input(GenerateMonthlyInput)
    .output(
      z.object({
        created: z.number().describe("Dues created by this run"),
        skipped: z.number().describe("Flats skipped because their due already existed"),
      }),
    )
    .mutation(({ ctx, input }) => dueService.generateMonthly(ctx.user, input)),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: duePath(""),
        tags: ["Dues"],
        summary: "List dues (role-aware scope)",
        description:
          "Cursor-paginated dues filterable by status/month/year. Residents see their own " +
          "flat's dues; admins see the whole society's and may filter by flat. Errors: 401 " +
          "if not authenticated, 403 for guards.",
        protect: true,
      },
    })
    .input(ListDuesInput)
    .output(
      z.object({
        items: z.array(DueModel).describe("Dues on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => dueService.listDues(ctx.user, input)),
});

export const paymentRouter = router({
  initiate: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("initiate"),
        tags: ["Dues"],
        summary: "Start a payment for a due",
        description:
          "Creates an INITIATED payment for one of the caller's own flat's dues and returns " +
          "gateway session data. MOCK GATEWAY for MVP: the session is placeholder data and no " +
          "real money moves — real Razorpay/Stripe wiring is a clearly-labeled later task. " +
          "Errors: 403 if not a resident, 404 if the due is not for the caller's flat, 409 if " +
          "the due is already paid.",
        protect: true,
      },
    })
    .input(InitiatePaymentInput)
    .output(
      z.object({
        payment: PaymentModel,
        gateway: z
          .object({
            provider: z.literal("MOCK").describe("Gateway identifier (mock for MVP)"),
            orderId: z.string().describe("Gateway order id"),
            checkoutUrl: z.string().describe("URL the client would open to complete payment"),
          })
          .describe("Gateway session data (placeholder until a real gateway is wired)"),
      }),
    )
    .mutation(({ ctx, input }) => paymentService.initiatePayment(ctx.user, input)),

  webhook: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("webhook"),
        tags: ["Dues"],
        summary: "Payment gateway webhook (not for app clients)",
        description:
          "CALLED BY THE PAYMENT GATEWAY, NOT BY APP CLIENTS. Confirms a payment's outcome: " +
          "on payment.success the payment becomes SUCCESS and its due becomes PAID; on " +
          "payment.failed the payment becomes FAILED and the due stays payable. Requests are " +
          "verified with an HMAC-SHA256 signature over 'event:paymentId:transactionId' using " +
          "the shared webhook secret, and processing is idempotent — replaying a processed " +
          "event returns the current state without side effects. Errors: 401 on a bad " +
          "signature, 404 for an unknown payment, 409 if the event conflicts with an " +
          "already-terminal payment, 412 if webhooks are not configured.",
      },
    })
    .input(WebhookInput)
    .output(
      z.object({
        paymentStatus: PaymentStatusEnum.describe("Payment status after processing"),
        dueStatus: DueStatusEnum.describe("Linked due's status after processing"),
      }),
    )
    .mutation(({ input }) => paymentService.handleWebhook(input)),

  history: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: paymentPath(""),
        tags: ["Dues"],
        summary: "List the caller's payment history",
        description:
          "Cursor-paginated payments of the calling resident, newest first — every attempt " +
          "including INITIATED and FAILED ones. Errors: 403 if not a resident, 412 if the " +
          "account has no resident profile.",
        protect: true,
      },
    })
    .input(HistoryInput)
    .output(
      z.object({
        items: z.array(PaymentModel).describe("Payments on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => paymentService.paymentHistory(ctx.user, input)),
});
