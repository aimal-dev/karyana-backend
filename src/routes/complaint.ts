import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";
import transporter from "../utils/mailer.js";
import createNotification from "../utils/notification-helper.js";

const router = express.Router();

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
  try {
    await transporter.sendMail({
      from: `"Karyana Store" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Complaint: ${subject} from ${req.user!.name}`,
      text: `Message: ${message}`,
    });
  } catch (err) {
    console.error("Failed to send complaint email:", err);
  }

  await createNotification({ 
    role: "ADMIN", 
    message: `New complaint submitted by ${req.user!.name}: ${subject}`, 
    link: `/admin/complaints/${complaint.id}` 
  });

  res.json({ message: "Complaint submitted & Admin notified", complaint });
});

// ----------------------
// 3️⃣ Seller/Admin: Get complaints for their products
// ----------------------
router.get("/seller", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const where: any = {};

  const complaints = await prisma.complaint.findMany({
    where,
    include: { user: true, product: true, order: true },
    orderBy: { createdAt: "desc" }
  });

  res.json({ complaints });
});

// ----------------------
// 4️⃣ Seller/Admin: Reply to complaint & notify user
// ----------------------
router.put("/reply/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  const { sellerReply } = req.body;
  // if (!sellerReply) return res.status(400).json({ error: "Reply cannot be empty" }); // Removed to allow status-only updates

  // Fetch existing to append
  const existing = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!existing) return res.status(404).json({ error: "Complaint not found" });

  const { status } = req.body; // sellerReply already destructured above
  if (!sellerReply && !status) return res.status(400).json({ error: "Reply or status update required" });

  let newReply = existing.sellerReply || "";
  if (sellerReply) {
    // Fallback if name is missing in token (old tokens)
    const replierName = req.user!.name || (req.user!.role === "ADMIN" ? "Admin" : "Seller"); 
    const prefix = `[${req.user!.role} - ${replierName}]: `;
    newReply = newReply ? `${newReply}\n\n${prefix}${sellerReply}` : `${prefix}${sellerReply}`;
  }

  const updated = await prisma.complaint.update({
    where: { id: complaintId },
    data: { 
      sellerReply: newReply, 
      status: status || "PROCESSING" // Use provided status (e.g. RESOLVED) or default to PROCESSING
    },
    include: { user: true },
  });

  // Email + notification to user
  if (updated.user?.email) {
    try {
      await transporter.sendMail({
        from: `"Karyana Store" <${process.env.EMAIL_USER}>`,
        to: updated.user.email,
        subject: `Reply to your complaint: ${updated.subject}`,
        text: `Seller/Admin replied: ${sellerReply}`,
      });
    } catch (err) {
       console.error("Failed to send reply email:", err);
    }
  }

  await createNotification({ 
    userId: updated.user.id, 
    message: `There's a reply to your complaint: ${updated.subject}`, 
    link: `/dashboard/complaints` 
  });

  res.json({ message: "Reply added & user notified", updated });
});

// ----------------------
// 5️⃣ User: Reply to seller/admin
// ----------------------
router.put("/user-reply/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  const { userReply } = req.body;
  const userId = req.user!.id;
  if (!userReply) return res.status(400).json({ error: "Reply cannot be empty" });

  // Fetch existing to append
  const existing = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!existing || existing.userId !== userId) return res.status(403).json({ error: "Not allowed" });

  if (!userReply) return res.status(400).json({ error: "Reply cannot be empty" });

  let newReply = existing.sellerReply || ""; // We append to the SAME field 'sellerReply' which acts as the chat history now
  // Wait, if we use 'sellerReply' for ALL chat history, we should rename it to 'history' or 'messages' ideally, 
  // but to avoid DB migration now, we will use 'sellerReply' as the shared chat buffer.
  
  if (userReply) {
    const replierName = req.user!.name || "User";
    const prefix = `[USER - ${replierName}]: `;
    newReply = newReply ? `${newReply}\n\n${prefix}${userReply}` : `${prefix}${userReply}`;
  }

  const updated = await prisma.complaint.update({ 
    where: { id: complaintId }, 
    data: { 
      sellerReply: newReply
      // Users cannot resolve complaints anymore, only Admin/Seller can.
    } 
  });

  // Notification to Admin
  await createNotification({ 
    role: "ADMIN", 
    message: `User ${req.user!.name} replied to complaint #${complaintId}`, 
    link: `/admin/complaints/${complaintId}` 
  });

  res.json({ message: "Reply sent & Admin notified", updated });
});

// ----------------------
// 6️⃣ Seller/Admin: Delete complaint
// ----------------------
router.delete("/seller/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const complaintId = Number(req.params.id);
  await prisma.complaint.delete({ where: { id: complaintId } });
  res.json({ message: "Complaint deleted" });
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
