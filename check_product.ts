import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const p = await prisma.product.findUnique({ where: { id: 101 } })
  console.log(`ID: 101 | Image: ${p?.image?.substring(0, 100)}...`)
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
