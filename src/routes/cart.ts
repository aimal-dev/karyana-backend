// ----------------------
// CART ROUTES
// ----------------------
// ✅ User: Can view, add, update, and remove items from their own cart

import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

type CartItemInput = {
  productId: number;
  qty: number;
};

// ----------------------
// 1️⃣ Get all cart items for logged-in user
// ----------------------
router.get("/", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: true } } },
  });

  res.json({ cart: cart || { items: [] } });
});

// ----------------------
// 2️⃣ Add a product to cart
// ----------------------
router.post("/", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { productId, qty }: CartItemInput = req.body;

  if (!productId || qty <= 0) return res.status(400).json({ error: "Invalid product or quantity" });

  // Ensure product exists
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  // Find or create cart
  let cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId } });
  }

  // Check if item already in cart
  const existingItem = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId },
  });

  if (existingItem) {
    // Update quantity if already exists
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { qty: existingItem.qty + qty },
    });
  } else {
    // Add new cart item
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, qty },
    });
  }

  res.json({ message: "Product added to cart" });
});

// ----------------------
// 3️⃣ Update cart item quantity
// ----------------------
router.put("/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const cartItemId = Number(req.params.id);
  const { qty } = req.body;

  if (qty <= 0) return res.status(400).json({ error: "Quantity must be greater than 0" });

  // Find cart item
  const cartItem = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true },
  });

  if (!cartItem) return res.status(404).json({ error: "Cart item not found" });
  if (cartItem.cart.userId !== userId) return res.status(403).json({ error: "Not allowed" });

  // Update quantity
  const updated = await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { qty },
  });

  res.json({ message: "Cart item updated", updated });
});

// ----------------------
// 4️⃣ Delete cart item
// ----------------------
router.delete("/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const cartItemId = Number(req.params.id);

  // Find cart item
  const cartItem = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true },
  });

  if (!cartItem) return res.status(404).json({ error: "Cart item not found" });
  if (cartItem.cart.userId !== userId) return res.status(403).json({ error: "Not allowed" });

  // Delete item
  await prisma.cartItem.delete({ where: { id: cartItemId } });

  res.json({ message: "Cart item removed" });
});

export default router;
