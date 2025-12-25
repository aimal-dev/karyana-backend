import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function cleanup() {
  const result = await prisma.seller.deleteMany({
    where: {
      id: { gt: 1 }
    }
  });
  console.log("Cleanup result:", result);
}

cleanup()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
