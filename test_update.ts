import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const newImage = "data:image/jpeg;base64,TEST_DATA";
  const updated = await prisma.product.update({
    where: { id: 101 },
    data: { image: newImage }
  });
  console.log(`ID: 101 | New Image: ${updated.image?.substring(0, 50)}...`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
