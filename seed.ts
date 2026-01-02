import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // 1. Create Default Admin (User)
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@karyana.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@karyana.com",
      password: adminPassword,
      role: "ADMIN",
      phone: "0000000000"
    }
  });
  console.log({ admin });

  // 2. Create Default Seller
  const sellerPassword = await bcrypt.hash("seller123", 10);
  const seller = await prisma.seller.upsert({
    where: { email: "seller@karyana.com" },
    update: {},
    create: {
      name: "Default Seller",
      email: "seller@karyana.com",
      password: sellerPassword,
      phone: "03001234567",
      approved: true
    }
  });
  console.log({ seller });
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
