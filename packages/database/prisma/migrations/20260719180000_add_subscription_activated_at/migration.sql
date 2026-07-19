-- Subscription.activatedAt: when the first payment was captured.
--
-- Checkout has to create a Subscription row up front so the in-flight
-- SubscriptionPayment has something to point at, and that row was being
-- created in TRIALING — which made an abandoned checkout look like a live
-- plan. activatedAt is the honest marker: null = never paid for.

ALTER TABLE "Subscription" ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Backfill 1: anything that has actually been paid for is activated as of its
-- earliest successful payment. Without this, every existing paying society
-- would start reporting NONE.
UPDATE "Subscription" s
SET "activatedAt" = p."firstPaidAt"
FROM (
  SELECT "subscriptionId", MIN("paidAt") AS "firstPaidAt"
  FROM "SubscriptionPayment"
  WHERE "status" = 'SUCCESS' AND "paidAt" IS NOT NULL
  GROUP BY "subscriptionId"
) p
WHERE s."id" = p."subscriptionId";

-- Backfill 2: rows that reached a post-trial status without a recorded
-- successful payment (manual grants, data predating payment tracking) are
-- still real subscriptions. Date them from the period they hold.
UPDATE "Subscription"
SET "activatedAt" = "currentPeriodStart"
WHERE "activatedAt" IS NULL
  AND "status" IN ('ACTIVE', 'GRACE', 'EXPIRED', 'CANCELLED');

-- What remains null is exactly the intended set: TRIALING rows with no
-- successful payment — i.e. abandoned checkouts. Those now report as NONE.
