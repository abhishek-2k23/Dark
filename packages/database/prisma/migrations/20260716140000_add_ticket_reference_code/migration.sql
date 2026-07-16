-- Adds a human-readable reference code to every helpdesk ticket.
--
-- Done in three steps because the column is NOT NULL + UNIQUE and existing
-- tickets have no value: add it nullable, backfill each row with a distinct
-- code, then enforce the constraints.

-- 1. Nullable to begin with, so existing rows survive the ALTER.
ALTER TABLE "HelpdeskTicket" ADD COLUMN "referenceCode" TEXT;

-- 2. Backfill. Seeding md5 with the row's own id (which is unique) guarantees
--    distinct codes without relying on random() not colliding. Hex is already
--    free of the characters that get misread aloud (no O/I/L vs 0/1).
UPDATE "HelpdeskTicket"
SET "referenceCode" = 'TKT-' || upper(substring(md5("id") from 1 for 6))
WHERE "referenceCode" IS NULL;

-- 3. Now that every row has one, enforce it.
ALTER TABLE "HelpdeskTicket" ALTER COLUMN "referenceCode" SET NOT NULL;
CREATE UNIQUE INDEX "HelpdeskTicket_referenceCode_key" ON "HelpdeskTicket"("referenceCode");
