import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany();
  orders.forEach(o => console.log(`Order ID: ${o.id}, Status: ${o.status}`));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
