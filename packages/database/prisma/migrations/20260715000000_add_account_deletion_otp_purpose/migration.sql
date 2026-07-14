-- AlterEnum
-- Adds the ACCOUNT_DELETION purpose so the same OTP table can gate account deletion.
ALTER TYPE "EmailOtpPurpose" ADD VALUE 'ACCOUNT_DELETION';
