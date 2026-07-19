import { dueService, paymentService, serviceBillService } from "@repo/services";

import { z } from "../../schema";
import { adminProcedure, subscribedAdminProcedure, protectedProcedure, publicProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const duePath = generatePath("v1/dues");
const paymentPath = generatePath("v1/payments");
const serviceBillPath = generatePath("v1/service-bills");

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const DueStatusEnum = z.enum(["PENDING", "PAID", "OVERDUE"]).describe("Due status");

const PaymentMethodEnum = z
  .enum(["UPI", "CARD", "NETBANKING", "UPI_DIRECT", "OFFLINE"])
  .describe(
    "Payment method. UPI/CARD/NETBANKING go through the gateway; UPI_DIRECT is a " +
      "peer-to-peer UPI transfer to the payee's own VPA; OFFLINE is cash/cheque/bank " +
      "transfer evidenced by a receipt",
  );

/**
 * Methods the gateway can actually take money with. The manual rails are
 * deliberately absent: they have no checkout, so accepting one here would mint
 * a meaningless session. They post to /v1/payments/upi and /v1/payments/offline.
 */
const GatewayMethodEnum = z
  .enum(["UPI", "CARD", "NETBANKING"])
  .describe("Gateway payment method");

const TargetKindEnum = z
  .enum(["DUE", "BOOKING", "SERVICE_BILL"])
  .describe("What the payment settles: a maintenance due, an amenity booking, or a service bill");

const PaymentStatusEnum = z
  .enum(["INITIATED", "PENDING_VERIFICATION", "SUCCESS", "FAILED", "REJECTED"])
  .describe(
    "Payment status. PENDING_VERIFICATION and REJECTED apply to the manual rails " +
      "(OFFLINE, UPI_DIRECT): evidence awaiting a decision, and evidence turned down " +
      "or a self-attested service payment an admin reversed",
  );

const PaymentTargetInput = z.object({
  targetKind: TargetKindEnum,
  targetId: z.string().describe("Id of the due, booking, or service bill being paid"),
});

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
    targetKind: TargetKindEnum,
    targetId: z.string().describe("Id of the thing this payment settles"),
    targetLabel: z.string().describe("Human description of the target, e.g. '7/2026 maintenance'"),
    dueId: z.string().nullable().describe("Due this payment is against; null unless targetKind is DUE"),
    dueMonth: z.number().nullable().describe("Billing month of the due, if any"),
    dueYear: z.number().nullable().describe("Billing year of the due, if any"),
    bookingId: z.string().nullable().describe("Booking this payment is against, if any"),
    serviceBillId: z.string().nullable().describe("Service bill this payment is against, if any"),
    amount: z.number().describe("Amount of the payment"),
    method: PaymentMethodEnum,
    transactionId: z.string().nullable().describe("Gateway transaction id, once known"),
    upiUtr: z.string().nullable().describe("Payer-entered UPI reference (UPI_DIRECT only)"),
    status: PaymentStatusEnum,
    paidAt: z.string().nullable().describe("ISO time the payment succeeded, if it did"),
    receiptUrl: z.string().nullable().describe("Uploaded receipt (OFFLINE payments only)"),
    note: z.string().nullable().describe("Resident's note attached to the submission"),
    rejectionReason: z
      .string()
      .nullable()
      .describe("Why an admin rejected or reversed the payment, if they did"),
    verifiedAt: z.string().nullable().describe("ISO time an admin decided on the payment"),
    createdAt: z.string().describe("ISO time the payment was initiated"),
  })
  .describe("A payment attempt against a due, booking, or service bill");

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

const InitiatePaymentInput = PaymentTargetInput.extend({
  method: GatewayMethodEnum,
});

const SubmitOfflinePaymentInput = PaymentTargetInput.extend({
  receiptUrl: z.url().describe("Receipt image URL (Cloudinary RECEIPT kind)"),
  note: z
    .string()
    .max(300)
    .describe("Optional note for the admin, e.g. 'paid by cheque #123 to the office'")
    .optional(),
});

const SubmitUpiDirectInput = PaymentTargetInput.extend({
  utr: z
    .string()
    .min(6)
    .max(35)
    .describe("The UPI reference / UTR shown in the payer's UPI app after paying"),
  note: z.string().max(300).describe("Optional note for the admin").optional(),
});

const UpiIntentModel = z
  .object({
    uri: z.string().describe("upi://pay deep link — open on Android, and the QR payload everywhere"),
    vpa: z.string().describe("Payee's UPI ID, shown so the payer can pay by hand if the link fails"),
    payeeName: z.string().describe("Who is being paid"),
    amount: z.number().describe("Amount pre-filled into the intent"),
    note: z.string().describe("Transaction note pre-filled into the intent"),
  })
  .describe("Everything needed to render a UPI deep link and QR for one payment");

const PaymentOptionsModel = z
  .object({
    targetKind: TargetKindEnum,
    targetId: z.string().describe("The target these options apply to"),
    amount: z.number().describe("Amount owed"),
    payeeName: z.string().describe("Who receives the money"),
    gateway: z
      .boolean()
      .describe("Gateway rail open — only for societies whose linked account is ACTIVE"),
    upiDirect: z.boolean().describe("UPI-direct rail open — the payee has published a UPI ID"),
    offline: z.boolean().describe("Always true; offline works with no payee setup at all"),
  })
  .describe("Which payment rails are usable for a target right now");

const PendingPaymentModel = PaymentModel.extend({
  residentName: z.string().describe("Who submitted the payment"),
  flatNumber: z.string().describe("Submitting resident's flat number"),
  towerName: z.string().describe("Submitting resident's tower"),
}).describe("Manual-rail evidence awaiting an admin decision");

const ReverseServicePaymentInput = z.object({
  paymentId: z.string().describe("Id of the self-attested service-bill payment to reverse"),
  reason: z.string().min(1).max(300).describe("Shown to the resident; required"),
});

const PendingListInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size"),
  cursor: z.string().describe("Id of the last payment from the previous page").optional(),
});

const DecideManualPaymentInput = z.object({
  paymentId: z.string().describe("Id of the manual-rail payment to decide on"),
  approve: z.boolean().describe("true verifies the evidence and settles the target; false rejects it"),
  rejectionReason: z
    .string()
    .max(300)
    .describe("Shown to the resident when rejecting")
    .optional(),
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
  targetKind: TargetKindEnum.describe("Only payments settling this kind of target").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last payment from the previous page").optional(),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const dueRouter = router({
  generateMonthly: subscribedAdminProcedure
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

/**
 * The wire shape names the target `targetKind`/`targetId` so a payment body
 * reads unambiguously; the service layer's own ref is `{ kind, id }`. This is
 * the single translation point between the two.
 */
const toRef = (input: { targetKind: "DUE" | "BOOKING" | "SERVICE_BILL"; targetId: string }) => ({
  kind: input.targetKind,
  id: input.targetId,
});

export const paymentRouter = router({
  options: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: paymentPath("options"),
        tags: ["Dues"],
        summary: "Which payment rails are usable for a target",
        description:
          "Returns the amount owed, who receives it, and which of the three rails are open " +
          "right now: gateway (only for societies whose Razorpay linked account is ACTIVE), " +
          "UPI-direct (payee has published a UPI ID), and offline (always). Clients should " +
          "render exactly these, so a resident is never offered a method that would fail on " +
          "submission. Errors: 403 if not a resident, 404 if the target is not the caller's, " +
          "409 if it is already settled.",
        protect: true,
      },
    })
    .input(PaymentTargetInput)
    .output(PaymentOptionsModel)
    .query(({ ctx, input }) => paymentService.paymentOptions(ctx.user, toRef(input))),

  initiate: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("initiate"),
        tags: ["Dues"],
        summary: "Start a gateway payment for a due, booking, or service bill",
        description:
          "Creates an INITIATED payment against one of the caller's own targets and returns " +
          "gateway session data. MOCK GATEWAY for MVP: the session is placeholder data and no " +
          "real money moves — Razorpay Route wiring is Phase 7c. Only one payment may be in " +
          "flight per target at a time. Errors: 400 for a manual-rail method, 403 if not a " +
          "resident, 404 if the target is not the caller's, 409 if it is already settled or a " +
          "payment is already in progress, 412 if the payee cannot receive gateway money yet " +
          "(service people never can — they are paid over UPI or offline).",
        protect: true,
      },
    })
    .input(InitiatePaymentInput)
    .output(
      z.object({
        payment: PaymentModel,
        gateway: z
          .object({
            provider: z
              .enum(["MOCK", "RAZORPAY"])
              .describe(
                "RAZORPAY when the server has gateway credentials; MOCK otherwise (local dev " +
                  "and tests), so the whole flow stays exercisable without an account",
              ),
            orderId: z.string().describe("Gateway order id — the handle the webhook arrives with"),
            checkoutUrl: z
              .string()
              .nullable()
              .describe("MOCK only; Razorpay checkout is opened by the client SDK, not a URL"),
            keyId: z
              .string()
              .nullable()
              .describe("RAZORPAY only — the publishable key id the client SDK needs"),
            amount: z.number().describe("Amount to charge"),
            currency: z.literal("INR").describe("Always INR"),
          })
          .describe("Gateway session data for the client checkout"),
      }),
    )
    .mutation(({ ctx, input }) =>
      paymentService.initiatePayment(ctx.user, { ...toRef(input), method: input.method }),
    ),

  upiIntent: residentProcedure
    .meta({
      openapi: {
        method: "GET",
        path: paymentPath("upi-intent"),
        tags: ["Dues"],
        summary: "Build the UPI deep link / QR payload for a target",
        description:
          "Returns a upi://pay URI with the payee's VPA, amount, and a transaction note " +
          "pre-filled. Open it directly on Android; render it as a QR elsewhere. This moves no " +
          "money by itself — the payer pays peer-to-peer from their own UPI app and then " +
          "submits the UTR to /v1/payments/upi. Errors: 403 if not a resident, 404 if the " +
          "target is not the caller's, 409 if already settled, 412 if the payee has no UPI ID.",
        protect: true,
      },
    })
    .input(PaymentTargetInput)
    .output(UpiIntentModel)
    .query(({ ctx, input }) => paymentService.upiIntent(ctx.user, toRef(input))),

  submitUpiDirect: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("upi"),
        tags: ["Dues"],
        summary: "Report a peer-to-peer UPI payment",
        description:
          "For money already sent to the payee's VPA from the caller's own UPI app. The UTR is " +
          "evidence, not proof — the payer types it themselves — so for dues and bookings the " +
          "payment is recorded PENDING_VERIFICATION and the target STAYS PAYABLE until an admin " +
          "verifies it. Service bills are the exception: a society admin cannot know whether a " +
          "resident paid their maid, so those settle immediately and admins get a reversal " +
          "instead. Errors: 403 if not a resident, 404 if the target is not the caller's, 409 " +
          "if already settled or a payment is in flight, 412 if the payee has no UPI ID.",
        protect: true,
      },
    })
    .input(SubmitUpiDirectInput)
    .output(PaymentModel)
    .mutation(({ ctx, input }) =>
      paymentService.submitUpiDirectPayment(ctx.user, {
        ...toRef(input),
        utr: input.utr,
        note: input.note,
      }),
    ),

  submitOffline: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("offline"),
        tags: ["Dues"],
        summary: "Submit a receipt for a payment made outside the app",
        description:
          "For targets settled by cash, cheque, or a direct transfer. Upload the receipt via the " +
          "signed upload flow (kind RECEIPT) and send the URL here. The payment is recorded as " +
          "OFFLINE/PENDING_VERIFICATION and the target STAYS PAYABLE until an admin verifies it " +
          "— a receipt is a claim, not a settlement. Service bills are the exception and settle " +
          "immediately (see /v1/payments/upi). Errors: 400 for a foreign media URL, 403 if not " +
          "a resident, 404 for a target outside the caller's scope, 409 if it is already " +
          "settled or a payment is in flight, 412 if the account has no resident profile.",
        protect: true,
      },
    })
    .input(SubmitOfflinePaymentInput)
    .output(PaymentModel)
    .mutation(({ ctx, input }) =>
      paymentService.submitOfflinePayment(ctx.user, {
        ...toRef(input),
        receiptUrl: input.receiptUrl,
        note: input.note,
      }),
    ),

  pending: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: paymentPath("pending"),
        tags: ["Dues"],
        summary: "List manual-rail payments awaiting verification",
        description:
          "The admin verification queue for the caller's society — both uploaded receipts and " +
          "reported UPI transfers, across dues, bookings, and service bills. Oldest first: the " +
          "resident who has waited longest is the one whose due is closest to going overdue. " +
          "Cursor-paginated. Errors: 403 if not an admin, 412 if the account has no society.",
        protect: true,
      },
    })
    .input(PendingListInput)
    .output(
      z.object({
        items: z.array(PendingPaymentModel).describe("Payments on this page"),
        nextCursor: z.string().nullable().describe("Cursor for the next page, or null"),
      }),
    )
    .query(({ ctx, input }) => paymentService.listPendingPayments(ctx.user, input)),

  decide: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("decide"),
        tags: ["Dues"],
        summary: "Verify or reject a manually-submitted payment",
        description:
          "Approving marks the payment SUCCESS and settles its target in one transaction, so " +
          "the two can never disagree. Rejecting marks it REJECTED and leaves the target " +
          "payable so the resident may submit again — except for a booking, whose held slot is " +
          "released instead, since holding it for an unpaid booking would block everyone else. " +
          "Either way the resident is notified. Errors: 400 if the payment is not on a manual " +
          "rail, 403 if not an admin, 404 for a payment outside the admin's society, 409 if it " +
          "has already been decided.",
        protect: true,
      },
    })
    .input(DecideManualPaymentInput)
    .output(PaymentModel)
    .mutation(({ ctx, input }) => paymentService.decideManualPayment(ctx.user, input)),

  reverseService: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("service/reverse"),
        tags: ["Dues"],
        summary: "Reverse a self-attested service-bill payment",
        description:
          "Service-bill payments are believed on submission, because a society admin has no " +
          "way of knowing whether a resident actually paid their maid — gating those on admin " +
          "approval would be theatre. This is the recourse when a claim turns out to be wrong: " +
          "the payment becomes REJECTED, the bill returns to payable, and the resident is told " +
          "why. Errors: 400 if the payment is not against a service bill, 403 if not an admin, " +
          "404 for a payment outside the admin's society, 409 if it is not currently SUCCESS.",
        protect: true,
      },
    })
    .input(ReverseServicePaymentInput)
    .output(PaymentModel)
    .mutation(({ ctx, input }) => paymentService.reverseServicePayment(ctx.user, input)),

  webhook: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: paymentPath("webhook"),
        tags: ["Dues"],
        summary: "Payment gateway webhook (not for app clients)",
        description:
          "CALLED BY THE PAYMENT GATEWAY, NOT BY APP CLIENTS. Confirms a payment's outcome: " +
          "on payment.success the payment becomes SUCCESS and its target is settled; on " +
          "payment.failed the payment becomes FAILED and the target stays payable (a booking's " +
          "held slot is released). Requests are verified with an HMAC-SHA256 signature over " +
          "'event:paymentId:transactionId' using the shared webhook secret, and processing is " +
          "idempotent — replaying a processed event returns the current state without side " +
          "effects. Errors: 400 if the payment is on a manual rail and has no gateway behind " +
          "it, 401 on a bad signature, 404 for an unknown payment, 409 if the event conflicts " +
          "with an already-terminal payment, 412 if webhooks are not configured.",
      },
    })
    .input(WebhookInput)
    .output(
      z.object({
        paymentStatus: PaymentStatusEnum.describe("Payment status after processing"),
        targetSettled: z
          .boolean()
          .describe("Whether the due/booking/service bill is now settled"),
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

// ---------------------------------------------------------------------------
// Service bills
// ---------------------------------------------------------------------------

const ServiceBillModel = z
  .object({
    id: z.string().describe("Service bill id"),
    serviceProviderId: z.string().describe("Who the bill is owed to"),
    serviceProviderName: z.string().describe("Service person's name"),
    serviceProviderCategory: z.string().describe("MAID / ELECTRICIAN / PLUMBER / DRIVER / OTHER"),
    serviceProviderPhone: z.string().describe("Service person's phone"),
    serviceProviderPhotoUrl: z.string().nullable().describe("Service person's photo, if any"),
    serviceProviderHasUpi: z
      .boolean()
      .describe("Whether this person can be paid over UPI, or only offline"),
    amount: z.number().describe("Amount owed"),
    description: z.string().nullable().describe("What the bill is for"),
    periodLabel: z.string().nullable().describe("Free-text billing period, e.g. 'July 2026'"),
    status: DueStatusEnum,
    createdAt: z.string().describe("ISO time the bill was raised"),
  })
  .describe("A bill a resident owes an individual service person");

const CreateServiceBillInput = z.object({
  serviceProviderId: z.string().describe("Service person from the caller's society directory"),
  amount: z.number().positive().describe("Amount owed"),
  description: z.string().max(300).describe("What the bill is for").optional(),
  periodLabel: z.string().max(60).describe("Billing period label, e.g. 'July 2026'").optional(),
});

const ListServiceBillsInput = z.object({
  status: DueStatusEnum.describe("Only bills with this status").optional(),
  serviceProviderId: z.string().describe("Only bills owed to this service person").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last bill from the previous page").optional(),
});

export const serviceBillRouter = router({
  create: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: serviceBillPath(""),
        tags: ["Dues"],
        summary: "Raise a bill owed to a service person",
        description:
          "Residents raise their own service bills — a service person is a directory entry " +
          "with no login, so they cannot raise one themselves. The service person must be in " +
          "the caller's society directory. Pay it via /v1/payments/upi or /v1/payments/offline; " +
          "the gateway rail is never available for service bills. Errors: 403 if not a " +
          "resident, 404 if the service person is not in the caller's society, 412 if the " +
          "account has no resident profile or society.",
        protect: true,
      },
    })
    .input(CreateServiceBillInput)
    .output(ServiceBillModel)
    .mutation(({ ctx, input }) => serviceBillService.createBill(ctx.user, input)),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: serviceBillPath(""),
        tags: ["Dues"],
        summary: "List service bills (role-aware scope)",
        description:
          "Residents see their own bills; admins see the whole society's, because the power to " +
          "reverse a self-attested payment is theirs and they need to find the bill behind a " +
          "dispute. Cursor-paginated, newest first. Errors: 401 if not authenticated, 412 if " +
          "the account has no society.",
        protect: true,
      },
    })
    .input(ListServiceBillsInput)
    .output(
      z.object({
        items: z.array(ServiceBillModel).describe("Bills on this page"),
        nextCursor: z.string().nullable().describe("Cursor for the next page, or null"),
      }),
    )
    .query(({ ctx, input }) => serviceBillService.listBills(ctx.user, input)),

  delete: residentProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: serviceBillPath("{billId}"),
        tags: ["Dues"],
        summary: "Delete a service bill raised in error",
        description:
          "Only the resident who raised it, and only while it is unpaid with no payment " +
          "attempts against it — a bill that has ever been paid is part of the money trail. " +
          "Errors: 403 if not a resident, 404 if the bill is not the caller's, 409 if it is " +
          "paid or has payment attempts.",
        protect: true,
      },
    })
    .input(z.object({ billId: z.string().describe("Id of the bill to delete") }))
    .output(z.object({ id: z.string().describe("Id of the deleted bill") }))
    .mutation(({ ctx, input }) => serviceBillService.deleteBill(ctx.user, input)),
});
