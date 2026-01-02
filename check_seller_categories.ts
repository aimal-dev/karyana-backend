import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sellerId = 2; // Assuming active seller ID is 2
  const categories = await prisma.category.findMany({
    where: {
      OR: [
        { sellerId: sellerId },
        { sellerId: null }
      ]
    },
    select: { id: true, name: true, sellerId: true }
  });
  console.log("Categories visible to Seller 2:", categories.length);
  if(categories.length > 0) console.log(categories.slice(0, 3));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
