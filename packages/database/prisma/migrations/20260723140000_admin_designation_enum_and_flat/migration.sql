-- Phase 18.2 + 18.6: designation becomes an enum of committee titles, and an
-- admin can optionally link the flat they live in.

-- CreateEnum
CREATE TYPE "AdminDesignation" AS ENUM ('PRESIDENT', 'SECRETARY', 'TREASURER', 'COMMITTEE_MEMBER', 'MANAGER', 'OTHER');

-- AlterColumn: coerce existing free-text designations into the enum. Known
-- titles map across (case-insensitively); everything else — including the old
-- "Society Admin" default from registerSociety — falls back to OTHER.
ALTER TABLE "AdminProfile"
  ALTER COLUMN "designation" TYPE "AdminDesignation"
  USING (
    CASE
      WHEN "designation" IS NULL THEN NULL
      WHEN upper(btrim("designation")) IN ('PRESIDENT', 'CHAIRMAN', 'CHAIRPERSON', 'CHAIR') THEN 'PRESIDENT'
      WHEN upper(btrim("designation")) IN ('SECRETARY', 'JOINT SECRETARY', 'JOINT_SECRETARY') THEN 'SECRETARY'
      WHEN upper(btrim("designation")) = 'TREASURER' THEN 'TREASURER'
      WHEN upper(btrim("designation")) IN ('COMMITTEE MEMBER', 'COMMITTEE_MEMBER', 'MEMBER') THEN 'COMMITTEE_MEMBER'
      WHEN upper(btrim("designation")) IN ('MANAGER', 'ESTATE MANAGER', 'ESTATE_MANAGER') THEN 'MANAGER'
      ELSE 'OTHER'
    END
  )::"AdminDesignation";

-- AlterTable: optional linked flat for an admin who also lives in the society.
ALTER TABLE "AdminProfile" ADD COLUMN "flatId" TEXT;

-- AddForeignKey
ALTER TABLE "AdminProfile" ADD CONSTRAINT "AdminProfile_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
