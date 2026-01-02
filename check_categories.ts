import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const categories = await prisma.category.findMany();
  console.log("Total Categories:", categories.length);
  console.log(categories);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
