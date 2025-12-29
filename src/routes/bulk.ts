import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";
import multer from "multer";
import csv from "csv-parser";
import { Parser } from "json2csv";
import { Readable } from "stream";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ------------------------------------------------------------------
// 1. PRODUCTS IMPORT/EXPORT
// ------------------------------------------------------------------

// ✅ Export Products to CSV
router.get("/products/export", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const sellerId = req.user!.id;
    const where = req.user!.role === "ADMIN" ? {} : { sellerId };

    const products = await prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } }
    });

    const fields = [
      { label: "ID", value: "id" },
      { label: "Title", value: "title" },
      { label: "Description", value: "description" },
      { label: "Price", value: "price" },
      { label: "Stock", value: "stock" },
      { label: "Image URL", value: "image" },
      { label: "Category", value: "category.name" },
      { label: "Featured", value: "isFeatured" },
      { label: "Trending", value: "isTrending" },
      { label: "On Sale", value: "isOnSale" },
      { label: "Old Price", value: "oldPrice" },
      { label: "Tags", value: (row: any) => row.tags.join(", ") }
    ];

    const json2csv = new Parser({ fields });
    const csvData = json2csv.parse(products);

    res.header("Content-Type", "text/csv");
    res.attachment(`products-export-${Date.now()}.csv`);
    return res.send(csvData);
  } catch (error: any) {
    res.status(500).json({ error: "Export failed", details: error.message });
  }
});

// ✅ Import Products from CSV
router.post("/products/import", authenticateToken, verifyRoles("SELLER", "ADMIN"), upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const sellerId = req.user!.id;
  const results: any[] = [];
  const stream = Readable.from(req.file.buffer.toString());

  stream
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {
        const createdProducts = [];
        for (const row of results) {
          // Find or create category
          let categoryId = 1;
          const catName = row.Category || row.category;
          
          if (catName) {
            const safeName = String(catName).trim();
            const cat = await prisma.category.findFirst({
              where: { name: { equals: safeName, mode: "insensitive" } }
            });
            if (cat) {
              categoryId = cat.id;
            } else {
              const newCat = await prisma.category.create({
                data: {
                  name: safeName,
                  image: "",
                  sellerId: req.user!.role === "ADMIN" ? null : sellerId
                }
              });
              categoryId = newCat.id;
            }
          }

          const rawTags = row.Tags || row.tags;
          const tags = rawTags ? String(rawTags).split(/[,|]/).map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

          const product = await prisma.product.create({
            data: {
              title: row.Title,
              description: row.Description,
              price: parseFloat(row.Price) || 0,
              stock: parseInt(row.Stock) || 0,
              image: row["Image URL"] || row.ImageURL || "",
              sellerId: row.SellerID ? Number(row.SellerID) : sellerId,
              categoryId,
              isFeatured: row.Featured === "true",
              isTrending: row.Trending === "true",
              isOnSale: row["On Sale"] === "true",
              oldPrice: row["Old Price"] ? parseFloat(row["Old Price"]) : null,
              tags
            }
          });
          createdProducts.push(product);
        }
        res.json({ message: `${createdProducts.length} products imported successfully`, count: createdProducts.length });
      } catch (error: any) {
        res.status(500).json({ error: "Import failed during database sync", details: error.message });
      }
    });
});

// ------------------------------------------------------------------
// 2. CATEGORIES IMPORT/EXPORT
// ------------------------------------------------------------------

// ✅ Export Categories to CSV
router.get("/categories/export", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    const sellerId = req.user!.id;
    const where = req.user!.role === "ADMIN" ? {} : { sellerId };

    const categories = await prisma.category.findMany({ where });

    const fields = ["id", "name", "image"];
    const json2csv = new Parser({ fields });
    const csvData = json2csv.parse(categories);

    res.header("Content-Type", "text/csv");
    res.attachment(`categories-export-${Date.now()}.csv`);
    return res.send(csvData);
  } catch (error: any) {
    res.status(500).json({ error: "Export failed", details: error.message });
  }
});

// ✅ Import Categories from CSV
router.post("/categories/import", authenticateToken, verifyRoles("SELLER", "ADMIN"), upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const sellerId = req.user!.id;
  const results: any[] = [];
  const stream = Readable.from(req.file.buffer.toString());

  stream
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {
        const createdCategories = [];
        for (const row of results) {
          const cat = await prisma.category.create({
            data: {
              name: row.name || row.Name,
              image: row.image || row.Image || "",
              sellerId: req.user!.role === "ADMIN" ? null : sellerId
            }
          });
          createdCategories.push(cat);
        }
        res.json({ message: `${createdCategories.length} categories imported successfully`, count: createdCategories.length });
      } catch (error: any) {
        res.status(500).json({ error: "Import failed during database sync", details: error.message });
      }
    });
});

export default router;
