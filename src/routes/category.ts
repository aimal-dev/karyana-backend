import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// GET all categories for the seller
router.get("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;
  const where = req.user!.role === "ADMIN" ? {} : { sellerId };
  const categories = await prisma.category.findMany({ where, include: { seller: { select: { name: true } } } });
  res.json({ categories });
});

// CREATE a new category
router.post("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { name, image } = req.body;
  const sellerId = req.user!.role === "ADMIN" ? null : req.user!.id;

  const category = await prisma.category.create({
    data: { name, image, sellerId },
  });

  res.json({ message: "Category created", category });
});

// UPDATE a category
router.put("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const categoryId = Number(req.params.id);
  const { name, image } = req.body;

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { name, image },
  });

  res.json({ message: "Category updated", updated });
});

// DELETE a category
router.delete("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const categoryId = Number(req.params.id);

  await prisma.category.delete({ where: { id: categoryId } });
  res.json({ message: "Category deleted" });
});

// BULK DELETE categories
router.post("/delete-many", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "Invalid IDs" });

  const where: any = { id: { in: ids.map(Number) } };
  
  // If Seller, restrict to own categories (cannot delete global/admin ones)
  if (req.user!.role !== "ADMIN") {
    where.sellerId = req.user!.id;
  }

  const result = await prisma.category.deleteMany({ where });
  res.json({ message: "Categories deleted", count: result.count });
});

// -------------------- User Routes --------------------

// GET all categories (for users)
router.get("/all", async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json({ categories });
});


export default router;
