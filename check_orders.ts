import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany({
    include: {
      user: true,
      items: true
    }
  });
  console.log("Total Orders:", orders.length);
  console.log("Orders:", JSON.stringify(orders, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
