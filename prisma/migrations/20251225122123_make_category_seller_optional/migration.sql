-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_sellerId_fkey";

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "sellerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
