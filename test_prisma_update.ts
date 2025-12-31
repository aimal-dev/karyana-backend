import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const productId = 52;
  const newImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // 1x1 base64
  
  console.log(`Attempting to update Product ${productId} with small base64 image...`);
  
  const updated = await prisma.product.update({
    where: { id: productId },
    data: { image: newImage },
    include: { images: true, variants: true }
  });
  
  console.log("Update result:");
  console.log(`- ID: ${updated.id}`);
  console.log(`- Title: ${updated.title}`);
  console.log(`- Image: ${updated.image}`);
  
  const checked = await prisma.product.findUnique({ where: { id: productId } });
  console.log(`\nRe-checked from DB: ${checked?.image === newImage ? "SUCCESS" : "FAILED"}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
