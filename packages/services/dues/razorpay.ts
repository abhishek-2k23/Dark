import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { logger } from "@repo/logger";

/**
 * Razorpay client — used for exactly one thing: a society's subscription to
 * Portl itself.
 *
 * That is an ordinary merchant sale. The society pays *us* for our own
 * software, so the money is ours to receive and none of the payment-aggregator
 * machinery applies: no Route, no linked accounts, no split settlement.
 *
 * Resident-facing money (maintenance dues, amenity bookings, service bills)
 * deliberately does NOT come through here. Those are peer-to-peer over UPI or
 * settled offline precisely so we never take custody of other people's funds —
 * see docs/payments.md.
 *
 * Unconfigured (no RAZORPAY_KEY_ID/SECRET) the module reports itself absent
 * and checkout is refused with a clear error, mirroring how Cloudinary
 * degrades in local dev.
 */

const API_BASE = "https://api.razorpay.com";

export function isConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Razorpay is not configured on this server",
    });
  }
  return { keyId, keySecret };
}

/** Rupees (Decimal-backed) → integer paise, which is the only unit Razorpay speaks. */
export function toPaise(rupees: number): number {
  // Round rather than truncate: 0.1 + 0.2 style drift would otherwise shave a
  // paisa off legitimate amounts, and Razorpay rejects non-integers outright.
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

async function call<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  if (!response.ok) {
    // Razorpay's error envelope is { error: { code, description, ... } }.
    let description = text;
    try {
      description = JSON.parse(text)?.error?.description ?? text;
    } catch {
      /* non-JSON body — fall back to the raw text */
    }
    logger.error("Razorpay API call failed", { method, path, status: response.status, description });
    throw new TRPCError({
      code: response.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
      message: `Razorpay: ${description}`,
    });
  }

  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * A plain order for a subscription purchase.
 *
 * No `transfers` array: the money is ours, so there is nothing to split. That
 * is the whole reason this integration needs neither Route nor the RBI
 * payment-aggregator eligibility that Route drags in.
 */
export async function createOrder(input: {
  amountRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("POST", "/v1/orders", {
    amount: toPaise(input.amountRupees),
    currency: "INR",
    receipt: input.receipt,
    ...(input.notes ? { notes: input.notes } : {}),
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Verify the handoff the Razorpay checkout SDK gives the client on success.
 *
 * The SDK hands the app `razorpay_order_id`, `razorpay_payment_id` and
 * `razorpay_signature`. The signature is an HMAC of `order_id|payment_id` with
 * our key secret — which only the server holds — so a client cannot forge one.
 *
 * This exists purely so the app can confirm immediately instead of waiting on
 * a webhook that may take seconds. It is NOT the source of truth: a client can
 * simply never call it (close the app mid-payment), so the webhook remains
 * authoritative and both paths converge on the same state.
 */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const given = Buffer.from(input.signature);
  const want = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/**
 * Verify a Razorpay webhook.
 *
 * The signature is an HMAC-SHA256 over the RAW request body. It must be the
 * exact bytes Razorpay sent — if a JSON parser has already round-tripped the
 * body, key order and whitespace change and every webhook fails verification.
 * The route captures the raw body specifically for this.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Razorpay webhooks are not configured on this server",
    });
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
