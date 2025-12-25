import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sellers = await prisma.seller.findMany();
  console.log("Current Sellers:", JSON.stringify(sellers, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
