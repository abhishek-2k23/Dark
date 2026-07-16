-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "TicketComment" ADD COLUMN     "photoUrls" TEXT[];
