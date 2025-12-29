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

    // Sanitize data for CSV (Handle Base64 images to prevent Excel crash)
    const sanitizedProducts = products.map((p: any) => ({
      ...p,
      image: p.image && p.image.startsWith("data:image") ? "BASE64_IMAGE_KEEP_EXISTING" : p.image,
      categoryName: p.category?.name
    }));

    const fields = [
      { label: "ID", value: "id" },
      { label: "Title", value: "title" },
      { label: "Description", value: "description" },
      { label: "Price", value: "price" },
      { label: "Stock", value: "stock" },
      { label: "Image URL", value: "image" },
      { label: "Category", value: "categoryName" },
      { label: "Featured", value: "isFeatured" },
      { label: "Trending", value: "isTrending" },
      { label: "On Sale", value: "isOnSale" },
      { label: "Old Price", value: "oldPrice" },
      { label: "Tags", value: (row: any) => row.tags.join(", ") }
    ];

    const json2csv = new Parser({ fields });
    const csvData = json2csv.parse(sanitizedProducts);

    res.header("Content-Type", "text/csv");
    res.attachment(`products-export-${Date.now()}.csv`);
    return res.send(csvData);
  } catch (error: any) {
    res.status(500).json({ error: "Export failed", details: error.message });
  }
});

// ✅ Import Products from CSV (Supports Update & Create)
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
        let createdCount = 0;
        let updatedCount = 0;
        
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

          // Image handling: Verify if we should update it
          const imageUrl = row["Image URL"] || row.ImageURL || row.image;
          const shouldUpdateImage = imageUrl && imageUrl !== "BASE64_IMAGE_KEEP_EXISTING";

          const productData: any = {
             title: row.Title || row.title,
             description: row.Description || row.description,
             price: parseFloat(row.Price || row.price) || 0,
             stock: parseInt(row.Stock || row.stock) || 0,
             categoryId,
             isFeatured: (row.Featured || row.featured) === "true",
             isTrending: (row.Trending || row.trending) === "true",
             isOnSale: (row["On Sale"] || row.onSale) === "true",
             oldPrice: (row["Old Price"] || row.oldPrice) ? parseFloat(row["Old Price"] || row.oldPrice) : null,
             tags
          };

          if (shouldUpdateImage) {
            productData.image = imageUrl;
          }

          const id = row.ID || row.id;

          if (id) {
            // Update existing
            const existing = await prisma.product.findUnique({ where: { id: Number(id) } });
            if (existing) {
              // Only allow update if Admin or Owner
              if (req.user!.role === "ADMIN" || existing.sellerId === sellerId) {
                 await prisma.product.update({
                   where: { id: Number(id) },
                   data: productData
                 });
                 updatedCount++;
              }
            } else {
               // ID provided but not found -> Create new? Or skip? 
               // usually safe to create as new if ID not found is rare, but usually ID means update.
               // Let's treat as create new (ignoring ID) or create with new ID.
               const p = await prisma.product.create({
                 data: { ...productData, sellerId: row.SellerID ? Number(row.SellerID) : sellerId, image: productData.image || "" }
               });
               createdCount++;
            }
          } else {
            // Create new
            const p = await prisma.product.create({
              data: { ...productData, sellerId: row.SellerID ? Number(row.SellerID) : sellerId, image: productData.image || "" }
            });
            createdCount++;
          }
        }
        res.json({ message: `Processed successfully: ${createdCount} created, ${updatedCount} updated.` });
      } catch (error: any) {
        res.status(500).json({ error: "Import failed", details: error.message });
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
