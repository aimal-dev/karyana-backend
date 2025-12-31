import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// GET seller profile
router.get("/profile", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = Number(req.user!.id);
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  res.json({ seller });
});

// Product management is now handled centrally in src/routes/product.ts
// Use /products endpoint for all product operations.

export default router;
