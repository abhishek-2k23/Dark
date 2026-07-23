-- Publish-time push for scheduled notices: a background sweep sends the
-- resident notification exactly once when scheduledAt passes. notifiedAt
-- records that send so the sweep never double-notifies; null means still owed.

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Backfill: existing already-visible notices (immediate, or scheduled in the
-- past) have effectively been "published" — mark them notified so the new
-- sweep doesn't blast a push for every old notice on first run.
UPDATE "Notice"
SET "notifiedAt" = COALESCE("scheduledAt", "createdAt")
WHERE "scheduledAt" IS NULL OR "scheduledAt" <= NOW();

-- CreateIndex
CREATE INDEX "Notice_notifiedAt_scheduledAt_idx" ON "Notice"("notifiedAt", "scheduledAt");
