import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// GET seller profile
router.get(
  "/profile",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const sellerId = req.user!.id;
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    res.json({ seller });
  }
);

// CREATE new product
router.post(
  "/",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const {
      title,
      description,
      price,
      stock,
      image,
      categoryId,
      images,
      tags,
      variants,
    } = req.body;

    let sellerId: number | null = req.user!.id;
    if (req.user!.role === "ADMIN") {
      sellerId = req.body.sellerId ? Number(req.body.sellerId) : null;
    }

    // Check for Duplicate
    const existing = await prisma.product.findFirst({
      where: {
        title: { equals: title, mode: "insensitive" },
        sellerId: sellerId,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Product already added! Search your inventory.",
        existingId: existing.id,
      });
    }

    // Parse tags
    let tagsList: string[] = [];
    if (Array.isArray(tags)) {
      tagsList = tags.map((t: string) => t.toLowerCase().trim());
    } else if (typeof tags === "string") {
      tagsList = tags
        .split(",")
        .map((t: string) => t.toLowerCase().trim())
        .filter(Boolean);
    }

    const product = await prisma.product.create({
      data: {
        title,
        description,
        price: Number(price),
        stock: Number(stock) || 0,
        image,
        sellerId,
        categoryId: Number(categoryId),
        isFeatured: Boolean(req.body.isFeatured),
        isTrending: Boolean(req.body.isTrending),
        isOnSale: Boolean(req.body.isOnSale),
        oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
        tags: tagsList,
        images: {
          create: (images || []).map((url: string) => ({ url })),
        },
        variants: {
          create: (variants || []).map((v: any) => ({
            name: v.name,
            price: Number(v.price),
            stock: Number(v.stock) || 0,
            image: v.image || null
          })),
        },
      },
      include: { images: true, variants: true },
    });

    res.json({ message: "Product created", product });
  }
);

// UPDATE product
router.put(
  "/:id",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const productId = Number(req.params.id);
    const {
      title,
      description,
      price,
      stock,
      image,
      categoryId,
      images,
      tags,
      variants,
    } = req.body;

    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) return res.status(404).json({ error: "Product not found" });

      if (req.user!.role !== "ADMIN" && product.sellerId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "Access denied. You don't own this product." });
      }

      console.log("---------------- BACKEND DEBUG ----------------");
      console.log(" productId:", productId);
      console.log(" image received length:", image?.length || 0);
      console.log(" image received start:", image?.substring(0, 100));
      console.log(" title:", title);
      console.log("-----------------------------------------------");

      const tagsList = Array.isArray(tags)
        ? tags.map((t: any) => String(t).toLowerCase().trim())
        : typeof tags === "string"
        ? tags
            .split(",")
            .map((t) => t.toLowerCase().trim())
            .filter(Boolean)
        : [];

      let finalSellerId = Number(product.sellerId);
      if (req.user!.role === "ADMIN" && req.body.sellerId) {
        finalSellerId = Number(req.body.sellerId);
      } else if (req.user!.role === "SELLER") {
        finalSellerId = Number(req.user!.id);
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productVariant.deleteMany({ where: { productId } });

        return await tx.product.update({
          where: { id: productId },
          data: {
            title,
            description,
            price: Number(price),
            stock: Number(stock) || 0,
            image,
            sellerId: finalSellerId,
            categoryId: Number(categoryId),
            isFeatured: Boolean(req.body.isFeatured),
            isTrending: Boolean(req.body.isTrending),
            isOnSale: Boolean(req.body.isOnSale),
            oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
            tags: tagsList,
            images: {
              create: (images || []).map((url: string) => ({ url })),
            },
            variants: {
              create: (variants || []).map((v: any) => ({
                name: v.name,
                price: Number(v.price),
                stock: Number(v.stock) || 0,
                image: v.image || null
              })),
            },
          },
          include: { images: true, variants: true },
        });
      });

      res.json({ message: "Product updated", updated: result });
    } catch (error: any) {
      console.error("[BACKEND UPDATE ERROR]:", error);
      res.status(500).json({ error: "Update failed", details: error.message });
    }
  }
);

// DELETE product
router.delete(
  "/:id",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    try {
      const productId = Number(req.params.id);

      // Manual Cascade Delete
      await prisma.cartItem.deleteMany({ where: { productId } });
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.review.deleteMany({ where: { productId } });

      await prisma.product.delete({ where: { id: productId } });
      res.json({ message: "Product deleted" });
    } catch (error: any) {
      // P2003 should no longer occur for OrderItems due to onDelete: SetNull in schema
      if (error.code === "P2003") {
        return res
          .status(400)
          .json({
            error:
              "Cannot delete product. It might be linked to other critical data.",
          });
      }
      if (error.code === "P2025") {
        return res.status(404).json({ error: "Product not found" });
      }
      res.status(500).json({ error: "Delete failed", details: error.message });
    }
  }
);

// BULK DELETE products
router.post(
  "/delete-many",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids))
        return res.status(400).json({ error: "Invalid IDs" });

      const where: any = { id: { in: ids.map(Number) } };

      // If Seller, restrict to own products
      if (req.user!.role !== "ADMIN") {
        where.sellerId = req.user!.id;
      }

      // Manual Cascade Delete for tables that might trigger constraints
      // Note: OrderItem constraint usually prevents deletion if product was ordered.
      await prisma.cartItem.deleteMany({
        where: { productId: { in: ids.map(Number) } },
      });
      await prisma.productImage.deleteMany({
        where: { productId: { in: ids.map(Number) } },
      });
      await prisma.productVariant.deleteMany({
        where: { productId: { in: ids.map(Number) } },
      });
      await prisma.review.deleteMany({
        where: { productId: { in: ids.map(Number) } },
      });

      const result = await prisma.product.deleteMany({ where });
      res.json({ message: "Products deleted", count: result.count });
    } catch (error: any) {
      console.error("Bulk Delete Error:", error);
      if (error.code === "P2003") {
        return res
          .status(400)
          .json({
            error: "Cannot delete products associated with existing Orders.",
          });
      }
      res.status(500).json({ error: "Delete failed", details: error.message });
    }
  }
);

// -------------------- User Routes --------------------

// GET all seller products with filters, search, pagination
router.get(
  "/",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const {
      page = 1,
      limit = 10,
      categoryId,
      minPrice,
      maxPrice,
      search,
    } = req.query;
    const where: any = {};
    
    // Support Shared Visibility: 
    // Admin sees ALL. 
    // Seller sees OWN + GLOBAL (sellerId: null).
    if (req.user!.role === "SELLER") {
      where.OR = [
        { sellerId: req.user!.id },
        { sellerId: null }
      ];
    }

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
      ];
    }

    const products = await prisma.product.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        category: true,
        images: true,
        variants: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.product.count({ where });

    res.json({ products, total, page: Number(page), limit: Number(limit) });
  }
);

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
        { category: { name: { contains: searchStr, mode: "insensitive" } } },
      ],
    },
    take: 5,
    select: {
      id: true,
      title: true,
      image: true,
      category: { select: { name: true } },
    },
  });

  res.json({ suggestions });
});

// GET all products for users (read-only) with filters, search, pagination
router.get("/all", async (req, res) => {
  const {
    page = 1,
    limit = 10,
    categoryId,
    minPrice,
    maxPrice,
    search,
  } = req.query;

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
      { category: { name: { contains: searchStr, mode: "insensitive" } } },
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
      variants: true,
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
      variants: true,
    },
  });

  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product });
});

export default router;
