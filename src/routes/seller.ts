import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import prisma from "../prismaClient.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";

const router = express.Router();

// GET seller profile
router.get("/profile", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = Number(req.user!.id);
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  res.json({ seller });
});

// CREATE new product
router.post("/products", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { title, description, price, stock, image, categoryId } = req.body;
 const sellerId = Number(req.user!.id);

  const product = await prisma.product.create({
    data: { title, description, price: Number(price), stock: Number(stock) || 0, image, sellerId, categoryId: Number(categoryId) },
  });

  res.json({ message: "Product created", product });
});

// GET all seller products
router.get("/products", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = Number(req.user!.id);
  const products = await prisma.product.findMany({ where: { sellerId } });
  res.json({ products });
});

// UPDATE product
router.put("/products/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const productId = Number(req.params.id);
  const { title, description, price, stock, image, categoryId } = req.body;

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { title, description, price: Number(price), stock: Number(stock) || 0, image, categoryId: Number(categoryId) },
  });

  res.json({ message: "Product updated", updated });
});

// DELETE product
router.delete("/products/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const productId = Number(req.params.id);

  await prisma.product.delete({ where: { id: productId } });
  res.json({ message: "Product deleted" });
});

export default router;
