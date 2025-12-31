import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const categories = await prisma.category.findMany({
    orderBy: [{ isStarred: 'desc' }, { name: 'asc' }]
  });
  console.log("Categories (Sorted by isStarred DESC):");
  categories.forEach(c => {
    console.log(`- [ID: ${c.id}] ${c.name} (Starred: ${c.isStarred})`);
  });

  const product = await prisma.product.findUnique({
    where: { id: 52 },
    include: { category: true }
  });
  console.log("\nProduct 52 Details:");
  if (product) {
    console.log(`Title: ${product.title}`);
    console.log(`Image (Start): ${product.image?.substring(0, 100)}...`);
    console.log(`Category: ${product.category?.name} [ID: ${product.categoryId}]`);
  } else {
    console.log("Product 52 not found.");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
