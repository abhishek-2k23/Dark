-- CreateEnum
CREATE TYPE "PayoutOnboardingStatus" AS ENUM ('NOT_STARTED', 'CREATED', 'ACTIVE', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_BILL_RAISED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_PAYMENT_REVERSED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_PAYMENT_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_TRANSFER_FAILED';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'UPI_DIRECT';

-- AlterTable
ALTER TABLE "Amenity" ADD COLUMN     "cancellationHours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "AmenityBooking" ADD COLUMN     "amountDue" DECIMAL(10,2),
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "serviceBillId" TEXT,
ADD COLUMN     "upiUtr" TEXT,
ALTER COLUMN "dueId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServiceProvider" ADD COLUMN     "upiVpa" TEXT;

-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "payoutStatus" "PayoutOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "razorpayAccountId" TEXT,
ADD COLUMN     "upiVpa" TEXT;

-- CreateTable
CREATE TABLE "ServiceBill" (
    "id" TEXT NOT NULL,
    "serviceProviderId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "periodLabel" TEXT,
    "status" "DueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceBill_residentId_idx" ON "ServiceBill"("residentId");

-- CreateIndex
CREATE INDEX "ServiceBill_serviceProviderId_idx" ON "ServiceBill"("serviceProviderId");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "AmenityBooking_status_holdExpiresAt_idx" ON "AmenityBooking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_serviceBillId_idx" ON "Payment"("serviceBillId");

-- CreateIndex
CREATE UNIQUE INDEX "Society_razorpayAccountId_key" ON "Society"("razorpayAccountId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "AmenityBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_serviceBillId_fkey" FOREIGN KEY ("serviceBillId") REFERENCES "ServiceBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBill" ADD CONSTRAINT "ServiceBill_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBill" ADD CONSTRAINT "ServiceBill_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "ResidentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A payment settles exactly one thing. Three nullable FKs would otherwise allow
-- a payment against nothing at all, or against a due AND a booking at once —
-- both of which would silently corrupt the admin queues and the paid/unpaid
-- derivation. Enforced in the database because the service layer is not the
-- only writer (seeds, migrations, and manual fixes all bypass it).
ALTER TABLE "Payment" ADD CONSTRAINT "payment_exactly_one_target" CHECK (
  (("dueId" IS NOT NULL)::int
   + ("bookingId" IS NOT NULL)::int
   + ("serviceBillId" IS NOT NULL)::int) = 1
);
