import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sellers = await prisma.seller.findMany();
  console.log("Seller Count:", sellers.length);
  console.log(sellers);
  
  const products = await prisma.product.findMany({ select: { id: true, sellerId: true }});
  console.log("Product Count:", products.length);
  if(products.length > 0) console.log("Sample Product:", products[0]);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
