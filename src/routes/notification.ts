import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// ----------------------
// 1️⃣ Get notifications
// ----------------------
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user!;

  let whereCondition: any = { read: false };

  if (user.role === "USER") whereCondition.userId = user.id;
  else if (user.role === "SELLER") whereCondition.sellerId = user.id;
  else if (user.role === "ADMIN") whereCondition.role = "ADMIN";

  const notifications = await prisma.notification.findMany({
    where: whereCondition,
    orderBy: { createdAt: "desc" },
  });

  res.json({ notifications });
});

// ----------------------
// 2️⃣ Mark notification as read
// ----------------------
router.put("/read/:id", authenticateToken, async (req: AuthRequest, res) => {
  const notifId = Number(req.params.id);
  const user = req.user!;

  const notif = await prisma.notification.findUnique({ where: { id: notifId } });
  if (!notif) return res.status(404).json({ error: "Notification not found" });

  // Check ownership
  if (
    (user.role === "USER" && notif.userId !== user.id) ||
    (user.role === "SELLER" && notif.sellerId !== user.id) ||
    (user.role === "ADMIN" && notif.role !== "ADMIN")
  ) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const updated = await prisma.notification.update({
    where: { id: notifId },
    data: { read: true },
  });

  res.json({ message: "Notification marked as read", updated });
});

// ----------------------
// 3️⃣ Create notification (Admin/Seller/User)
// ----------------------
router.post("/create", authenticateToken, async (req: AuthRequest, res) => {
  const { message, link, userId, sellerId, role } = req.body;

  const notif = await prisma.notification.create({
    data: { message, link, userId, sellerId, role },
  });

  res.json({ message: "Notification created", notif });
});

export default router;
