-- Bulk resident import (migrating a paper register or another app): an admin
-- uploads a spreadsheet and each row becomes a real User + ResidentProfile so
-- the register is immediately visible in the resident list and directory.
--
-- Those rows carry no credential at all (passwordHash and googleId both null),
-- so they cannot be logged into. importedAt marks them as awaiting a claim:
-- the first signup / Google sign-in on a matching email sets the credential
-- and nulls this column. That is what distinguishes a never-claimed import
-- from a genuine account, so signup can claim one instead of returning 409.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "importedAt" TIMESTAMP(3);

-- CreateIndex
-- The claim lookup is by email/phone (already unique), but the admin resident
-- list filters "not yet joined" per society, which this serves.
CREATE INDEX "User_societyId_importedAt_idx" ON "User"("societyId", "importedAt");
