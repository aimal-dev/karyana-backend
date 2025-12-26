import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// GET seller profile
router.get("/profile", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  res.json({ seller });
});

// CREATE new product
router.post("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { title, description, price, stock, image, categoryId, images, tags } = req.body;
  
  // If Admin is adding, they can optionally pass a sellerId. 
  // If not provided OR if it's a Seller adding, use their own ID.
  let sellerId = req.user!.id;
  if (req.user!.role === "ADMIN" && req.body.sellerId) {
    sellerId = Number(req.body.sellerId);
  }

  // Parse tags
  let tagsList: string[] = [];
  if (Array.isArray(tags)) {
    tagsList = tags.map((t: string) => t.toLowerCase().trim());
  } else if (typeof tags === "string") {
    tagsList = tags.split(",").map((t: string) => t.toLowerCase().trim()).filter(Boolean);
  }

  const product = await prisma.product.create({
    data: {
      title,
      description,
      price: Number(price),
      stock: Number(stock) || 0,
      image, // featured image
      sellerId,
      categoryId: Number(categoryId),
      isFeatured: Boolean(req.body.isFeatured),
      isTrending: Boolean(req.body.isTrending),
      isOnSale: Boolean(req.body.isOnSale),
      oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
      tags: tagsList,
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
  const { title, description, price, stock, image, categoryId, images, tags } = req.body;

  // Re-sync images: delete all and create new
  await prisma.productImage.deleteMany({ where: { productId } });

  // Parse tags
  let tagsList: string[] = [];
  if (Array.isArray(tags)) {
    tagsList = tags.map((t: string) => t.toLowerCase().trim());
  } else if (typeof tags === "string") {
    tagsList = tags.split(",").map((t: string) => t.toLowerCase().trim()).filter(Boolean);
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      title,
      description,
      price: Number(price),
      stock: Number(stock) || 0,
      sellerId: (req.user!.role === "ADMIN" && req.body.sellerId) ? Number(req.body.sellerId) : req.user!.id,
      categoryId: Number(categoryId),
      isFeatured: Boolean(req.body.isFeatured),
      isTrending: Boolean(req.body.isTrending),
      isOnSale: Boolean(req.body.isOnSale),
      oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
      tags: tagsList,
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
  
  if (search) {
     const searchStr = String(search).trim();
     const searchLower = searchStr.toLowerCase();
     where.OR = [
       { title: { contains: searchStr, mode: "insensitive" } },
       { description: { contains: searchStr, mode: "insensitive" } },
       { tags: { has: searchLower } }
     ];
  }

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

// GET search suggestions (public)
router.get("/suggestions", async (req, res) => {
  const { search } = req.query;
  if (!search) return res.json({ suggestions: [] });

  const searchStr = String(search).trim();
  const searchLower = searchStr.toLowerCase();

  const suggestions = await prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: searchStr, mode: "insensitive" } },
        { tags: { has: searchLower } },
        { category: { name: { contains: searchStr, mode: "insensitive" } } }
      ]
    },
    take: 5,
    select: {
      id: true,
      title: true,
      image: true,
      category: { select: { name: true } }
    }
  });

  res.json({ suggestions });
});

// GET all products for users (read-only) with filters, search, pagination
router.get("/all", async (req, res) => {
  const { page = 1, limit = 10, categoryId, minPrice, maxPrice, search } = req.query;

  const where: any = {};

  if (categoryId) where.categoryId = Number(categoryId);
  if (minPrice || maxPrice) where.price = {};
  if (minPrice) where.price.gte = Number(minPrice);
  if (maxPrice) where.price.lte = Number(maxPrice);
  
  if (search) {
     const searchStr = String(search).trim();
     const searchLower = searchStr.toLowerCase();
     where.OR = [
       { title: { contains: searchStr, mode: "insensitive" } },
       { description: { contains: searchStr, mode: "insensitive" } },
       { tags: { has: searchLower } },
       { category: { name: { contains: searchStr, mode: "insensitive" } } }
     ];
  }

  if (req.query.isTrending) where.isTrending = req.query.isTrending === "true";
  if (req.query.isFeatured) where.isFeatured = req.query.isFeatured === "true";
  if (req.query.isOnSale) where.isOnSale = req.query.isOnSale === "true";

  const products = await prisma.product.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    include: {
      seller: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      images: true,
      reviews: { select: { rating: true } },
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
