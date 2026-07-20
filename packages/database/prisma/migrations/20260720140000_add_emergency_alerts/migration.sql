-- Society-wide panic alarm: any member can raise one, everyone in the society
-- is notified, and anyone can sound the all-clear.

-- CreateEnum
CREATE TYPE "EmergencyType" AS ENUM ('MEDICAL', 'FIRE', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_RAISED';
ALTER TYPE "NotificationType" ADD VALUE 'EMERGENCY_RESOLVED';

-- CreateTable
CREATE TABLE "EmergencyAlert" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "type" "EmergencyType" NOT NULL,
    "note" TEXT,
    "raisedById" TEXT NOT NULL,
    "flatId" TEXT,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyAlert_societyId_status_createdAt_idx" ON "EmergencyAlert"("societyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyAlert_raisedById_idx" ON "EmergencyAlert"("raisedById");

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
