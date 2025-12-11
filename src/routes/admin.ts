import express from "express";
import prisma from "../prismaClient.ts";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
const router = express.Router();

// ✅ Approve a seller
router.put("/sellers/:id/approve", async (req, res) => {
  const sellerId = Number(req.params.id);
  const updatedSeller = await prisma.seller.update({
    where: { id: sellerId },
    data: { approved: true },
  });
  res.json({ message: "Seller approved", updatedSeller });
});

// ✅ Reject a seller
router.put("/sellers/:id/reject", async (req, res) => {
  const sellerId = Number(req.params.id);
  const updatedSeller = await prisma.seller.update({
    where: { id: sellerId },
    data: { approved: false },
  });
  res.json({ message: "Seller rejected", updatedSeller });
});

// ✅ Change website settings (example)
router.put("/settings", async (req, res) => {
  const { logoUrl, bannerUrl } = req.body;
  // aap settings table update kar sakte ho
  res.json({ message: "Settings updated", logoUrl, bannerUrl });
});

export default router;
