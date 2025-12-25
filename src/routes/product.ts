import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import prisma from "../prismaClient.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";

const router = express.Router();

// GET seller profile
router.get("/profile", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  res.json({ seller });
});

// CREATE new product
router.post("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { title, description, price, stock, image, categoryId, images } = req.body;
  const sellerId = req.user!.id;

  const product = await prisma.product.create({
    data: {
      title,
      description,
      price: Number(price),
      stock: Number(stock) || 0,
      image, // featured image
      sellerId,
      categoryId: Number(categoryId),
      images: {
        create: (images || []).map((url: string) => ({ url }))
      }
    },
    include: { images: true }
  });

  res.json({ message: "Product created", product });
});



// UPDATE product
router.put("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const productId = Number(req.params.id);
  const { title, description, price, stock, image, categoryId, images } = req.body;

  // Re-sync images: delete all and create new
  await prisma.productImage.deleteMany({ where: { productId } });

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      title,
      description,
      price: Number(price),
      stock: Number(stock) || 0,
      image,
      categoryId: Number(categoryId),
      images: {
        create: (images || []).map((url: string) => ({ url }))
      }
    },
    include: { images: true }
  });

  res.json({ message: "Product updated", updated });
});

// DELETE product
router.delete("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const productId = Number(req.params.id);

  await prisma.product.delete({ where: { id: productId } });
  res.json({ message: "Product deleted" });
});

// -------------------- User Routes --------------------




// GET all seller products with filters, search, pagination
router.get("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { page = 1, limit = 10, categoryId, minPrice, maxPrice, search } = req.query;
  const where: any = {};

  if (categoryId) where.categoryId = Number(categoryId);
  if (minPrice || maxPrice) where.price = {};
  if (minPrice) where.price.gte = Number(minPrice);
  if (maxPrice) where.price.lte = Number(maxPrice);
  if (search) where.title = { contains: String(search), mode: "insensitive" };

  const products = await prisma.product.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    include: {
      category: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.product.count({ where });

  res.json({ products, total, page: Number(page), limit: Number(limit) });
});

// GET all products for users (read-only) with filters, search, pagination
router.get("/all", async (req, res) => {
  const { page = 1, limit = 10, categoryId, minPrice, maxPrice, search } = req.query;

  const where: any = {};

  if (categoryId) where.categoryId = Number(categoryId);
  if (minPrice || maxPrice) where.price = {};
  if (minPrice) where.price.gte = Number(minPrice);
  if (maxPrice) where.price.lte = Number(maxPrice);
  if (search) where.title = { contains: String(search), mode: "insensitive" };

  const products = await prisma.product.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    include: {
      seller: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      images: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.product.count({ where });

  res.json({ products, total, page: Number(page), limit: Number(limit) });
});

// GET single product by ID (for users)
router.get("/:id", async (req, res) => {
  const productId = Number(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      seller: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      images: true,
    },
  });

  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product });
});

export default router;
