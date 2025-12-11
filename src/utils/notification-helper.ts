import prisma from "../prismaClient.ts";

async function createNotification(data: {
  userId?: number;
  sellerId?: number;
  message: string;
  link?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId ?? null,
      sellerId: data.sellerId ?? null,
      message: data.message,
      link: data.link ?? null,
    },
  });
}

export default createNotification;