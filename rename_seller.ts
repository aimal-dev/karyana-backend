import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1. Rename logic
  const seller = await prisma.seller.findUnique({ where: { id: 1 } });
  if (seller) {
    await prisma.seller.update({
      where: { id: 1 },
      data: { name: "Main Store" }
    });
    console.log("Renamed Seller 1 to 'Main Store'");
  } else {
    console.log("Seller 1 not found (maybe DB reset?)");
  }

  // 2. Add 'Main Store' tag to all products created by Admin (Seller 1)
  // This is purely visual, database stores it as Seller ID 1
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
