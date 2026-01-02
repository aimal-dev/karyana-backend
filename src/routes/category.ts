import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";

const router = express.Router();

// GET all categories for the seller
router.get("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;
  
  // LOGGING FOR DEBUGGING
  console.log(`[CATEGORY GET] User Role: ${req.user!.role}, ID: ${sellerId}`);

  const where = req.user!.role === "ADMIN" 
    ? {} 
    : { 
        OR: [
          { sellerId: Number(sellerId) }, // Ensure number type
          { sellerId: null }
        ]
      };
      
  console.log(`[CATEGORY GET] Query Where:`, JSON.stringify(where));

  const categories = await prisma.category.findMany({ 
    where, 
    include: { seller: { select: { name: true } } },
    orderBy: [
      { isStarred: "desc" },
      { name: "asc" }
    ]
  });
  
  console.log(`[CATEGORY GET] Found ${categories.length} categories`);
  res.json({ categories });
});

// CREATE a new category
router.post("/", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { name, image, isStarred } = req.body;
  const sellerId = req.user!.role === "ADMIN" ? null : req.user!.id;

  // 1. DUPLICATE CHECK
  const existing = await prisma.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" }
    }
  });

  if (existing) {
    return res.status(409).json({ 
      error: "Category already allowed/added! Check the list." 
    });
  }

  const category = await prisma.category.create({
    data: { 
      name, 
      image, 
      sellerId: sellerId ? Number(sellerId) : null,
      isStarred: Boolean(isStarred)
    },
  });

  res.json({ message: "Category created", category });
});

// UPDATE a category
router.put("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const categoryId = Number(req.params.id);
  const { name, image, isStarred } = req.body;

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { 
      name, 
      image,
      isStarred: Boolean(isStarred)
    },
  });

  res.json({ message: "Category updated", updated });
});

// DELETE a category
router.delete("/:id", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const categoryId = Number(req.params.id);
    await prisma.category.delete({ where: { id: categoryId } });
    res.json({ message: "Category deleted" });
  } catch (error: any) {
    if (error.code === 'P2003') {
        return res.status(400).json({ error: "Cannot delete category containing products. Please delete the products first." });
    }
    if (error.code === 'P2025') {
        return res.status(404).json({ error: "Category not found" });
    }
    res.status(500).json({ error: "Delete failed", details: error.message });
  }
});

// BULK DELETE categories
router.post("/delete-many", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "Invalid IDs" });

    const where: any = { id: { in: ids.map(Number) } };
    
    // If Seller, restrict to own categories (cannot delete global/admin ones)
    if (req.user!.role !== "ADMIN") {
      where.sellerId = req.user!.id;
    }

    const result = await prisma.category.deleteMany({ where });
    res.json({ message: "Categories deleted", count: result.count });
  } catch (error: any) {
    if (error.code === 'P2003') {
        return res.status(400).json({ error: "Cannot delete categories containing products. Please delete the products first." });
    }
    res.status(500).json({ error: "Delete failed", details: error.message });
  }
});

// -------------------- User Routes --------------------

// GET all categories (for users)
router.get("/all", async (req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [
      { isStarred: "desc" },
      { name: "asc" }
    ]
  });
  res.json({ categories });
});


export default router;
