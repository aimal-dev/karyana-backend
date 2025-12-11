import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import prisma from "../prismaClient.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";

const router = express.Router();

// GET all categories for the seller
router.get("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;
  const categories = await prisma.category.findMany({ where: { sellerId } });
  res.json({ categories });
});

// CREATE a new category
router.post("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { name } = req.body;
  const sellerId = req.user!.id;

  const category = await prisma.category.create({
    data: { name, sellerId },
  });

  res.json({ message: "Category created", category });
});

// UPDATE a category
router.put("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const categoryId = Number(req.params.id);
  const { name } = req.body;

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { name },
  });

  res.json({ message: "Category updated", updated });
});

// DELETE a category
router.delete("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const categoryId = Number(req.params.id);

  await prisma.category.delete({ where: { id: categoryId } });
  res.json({ message: "Category deleted" });
});

// -------------------- User Routes --------------------

// GET all categories (for users)
router.get("/all", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const categories = await prisma.category.findMany();
  res.json({ categories });
});


export default router;
