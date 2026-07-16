-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'JOIN_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'JOIN_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'JOIN_REQUEST_REJECTED';

-- CreateTable
CREATE TABLE "SocietyJoinRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedByAdminId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocietyJoinRequest_societyId_status_idx" ON "SocietyJoinRequest"("societyId", "status");

-- CreateIndex
CREATE INDEX "SocietyJoinRequest_userId_createdAt_idx" ON "SocietyJoinRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SocietyJoinRequest" ADD CONSTRAINT "SocietyJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyJoinRequest" ADD CONSTRAINT "SocietyJoinRequest_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyJoinRequest" ADD CONSTRAINT "SocietyJoinRequest_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
