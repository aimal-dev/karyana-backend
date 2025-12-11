import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import prisma from "../prismaClient.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";
import nodemailer from "nodemailer";

const router = express.Router();

// Setup transporter for nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ----------------------
// Notification helper
// ----------------------
async function createNotification(data: {
  userId?: number;
  sellerId?: number | null;
  message: string;
  link?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId ?? null,
      sellerId: data.sellerId ?? undefined,
      message: data.message,
      link: data.link ?? null,
    },
  });
}

// ----------------------
// 1️⃣ User: Get own complaints
// ----------------------
router.get("/my", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const complaints = await prisma.complaint.findMany({ where: { userId } });
  res.json({ complaints });
});

// ----------------------
// 2️⃣ User: Create a new complaint
// ----------------------
router.post("/", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  interface ComplaintBody { subject: string; message: string; }
  const { subject, message } = req.body as ComplaintBody;
  const userId = req.user!.id;

  if (!subject || !message) return res.status(400).json({ error: "Subject and message are required" });

  const complaint = await prisma.complaint.create({ data: { subject, message, userId } });

  // Email + notification to admin
  await transporter.sendMail({
    from: `"My Store" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Complaint: ${subject} from ${req.user!.name}`,
    text: `Message: ${message}`,
  });
  await createNotification({ sellerId: null, message: `New complaint submitted by ${req.user!.name}`, link: `/admin/complaints/${complaint.id}` });

  res.json({ message: "Complaint submitted", complaint });
});

// ----------------------
// 3️⃣ Seller/Admin: Get complaints for their products
// ----------------------
router.get("/seller", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;

  // Example: complaints linked via orders/items
  const complaints = await prisma.complaint.findMany({
    where: { order: { items: { some: { product: { sellerId } } } } },
    include: { user: true },
  });

  res.json({ complaints });
});

// ----------------------
// 4️⃣ Seller: Reply to complaint & notify user
// ----------------------
router.put("/reply/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  const { sellerReply } = req.body;
  if (!sellerReply) return res.status(400).json({ error: "Reply cannot be empty" });

  const updated = await prisma.complaint.update({
    where: { id: complaintId },
    data: { sellerReply },
    include: { user: true },
  });

  // Email + notification to user
  if (updated.user?.email) {
    await transporter.sendMail({
      from: `"My Store" <${process.env.EMAIL_USER}>`,
      to: updated.user.email,
      subject: `Reply to your complaint: ${updated.subject}`,
      text: `Seller replied: ${sellerReply}`,
    });
  }
  await createNotification({ userId: updated.user.id, message: `Seller replied to your complaint: ${updated.subject}`, link: `/complaints/${complaintId}` });

  res.json({ message: "Seller replied to complaint & user notified", updated });
});

// ----------------------
// 5️⃣ User: Reply to seller
// ----------------------
router.put("/user-reply/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  const { userReply } = req.body;
  const userId = req.user!.id;
  if (!userReply) return res.status(400).json({ error: "Reply cannot be empty" });

  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint || complaint.userId !== userId) return res.status(403).json({ error: "Not allowed" });

  const updated = await prisma.complaint.update({ where: { id: complaintId }, data: { userReply } });

  // Notification to seller/admin
  await createNotification({ sellerId: null, message: `User replied to complaint #${complaintId}`, link: `/admin/complaints/${complaintId}` });

  res.json({ message: "User replied to seller & notification sent", updated });
});

// ----------------------
// 6️⃣ Seller/Admin: Delete complaint
// ----------------------
router.delete("/seller/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  await prisma.complaint.delete({ where: { id: complaintId } });
  res.json({ message: "Complaint deleted by seller/admin" });
});

// ----------------------
// 7️⃣ User: Delete own complaint
// ----------------------
router.delete("/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  const userId = req.user!.id;

  const deleted = await prisma.complaint.deleteMany({ where: { id: complaintId, userId } });
  if (deleted.count === 0) return res.status(404).json({ error: "Complaint not found or not yours" });
  res.json({ message: "Complaint deleted" });
});

export default router;
