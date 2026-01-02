import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log("Cleaning up database...");
  
  // 1. Delete ALL Sellers (including the one I created)
  await prisma.seller.deleteMany({});
  console.log("Deleted all sellers.");

  // 2. Delete the created Admin USER from the DB (since you want it hardcoded only)
  await prisma.user.deleteMany({
    where: { email: "admin@karyana.com" }
  });
  console.log("Deleted DB Admin user.");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
