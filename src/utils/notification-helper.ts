import prisma from "../prismaClient.js";

async function createNotification(data: {
  userId?: number;
  sellerId?: number;
  role?: string;
  message: string;
  link?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId ?? null,
      sellerId: data.sellerId ?? null,
      role: data.role ?? null,
      message: data.message,
      link: data.link ?? null,
    },
  });
}

export default createNotification;