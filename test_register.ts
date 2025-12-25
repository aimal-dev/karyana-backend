import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function testRegister() {
  const name = "Karyana";
  const email = "saleperson@example.com";
  const password = "password123";

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Attempting to create seller with email:", email);
    const seller = await prisma.seller.create({
      data: { name, email, password: hashedPassword, approved: false },
    });
    console.log("Seller created successfully:", seller);
  } catch (error: any) {
    console.error("Prisma Error Details:");
    console.error("Code:", error.code);
    console.error("Meta:", error.meta);
    console.error("Message:", error.message);
  }
}

testRegister()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
