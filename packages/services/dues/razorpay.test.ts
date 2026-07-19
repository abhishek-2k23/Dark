import { afterEach, describe, expect, it } from "vitest";

import { isConfigured, toPaise, fromPaise, verifyWebhookSignature } from "./razorpay";

/**
 * Pure-function coverage for the Razorpay layer: money arithmetic and webhook
 * signature verification. Deliberately no network — the HTTP calls are
 * exercised against Razorpay's test mode by hand (see docs/payments.md).
 *
 * Razorpay is used here for exactly one thing: a society's own subscription to
 * Portl. Resident money never touches it.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("money conversion", () => {
  it("converts rupees to integer paise", () => {
    expect(toPaise(2000)).toBe(200_000);
    expect(toPaise(1200.5)).toBe(120_050);
    expect(toPaise(0.01)).toBe(1);
  });

  it("rounds rather than truncates, so float drift cannot shave a paisa", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE754; truncation would bill 1998.
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(Number.isInteger(toPaise(35.35))).toBe(true);
  });

  it("round-trips", () => {
    expect(fromPaise(toPaise(1234.56))).toBe(1234.56);
  });
});

describe("webhook signature verification", () => {
  const SECRET = "test-razorpay-webhook-secret";
  const body = JSON.stringify({ event: "payment.captured", payload: { a: 1 } });

  function sign(raw: string, secret = SECRET) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("node:crypto") as typeof import("node:crypto");
    return crypto.createHmac("sha256", secret).update(raw).digest("hex");
  }

  it("accepts a correctly signed raw body", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"))).toBe(false);
  });

  it("rejects a tampered body", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    const signature = sign(body);
    expect(verifyWebhookSignature(body.replace('"a":1', '"a":2'), signature)).toBe(false);
  });

  it("rejects a re-serialised body, which is why the route must use the raw bytes", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    const signature = sign(body);
    // Round-tripping through the JSON parser changes whitespace/key order —
    // this is the single most common way the integration breaks.
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(reserialised, signature)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    // timingSafeEqual throws on a length mismatch, so the guard must come first.
    expect(() => verifyWebhookSignature(body, "short")).not.toThrow();
    expect(verifyWebhookSignature(body, "short")).toBe(false);
  });

  it("refuses to verify at all when no webhook secret is set", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(() => verifyWebhookSignature(body, sign(body))).toThrow();
  });
});

describe("gateway configuration detection", () => {
  it("reports absent when credentials are missing, so MOCK takes over", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(isConfigured()).toBe(false);
  });

  it("requires both key id and secret", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(isConfigured()).toBe(false);

    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(isConfigured()).toBe(true);
  });
});
