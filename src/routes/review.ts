import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import prisma from "../prismaClient.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";
import nodemailer from "nodemailer";
import createNotification from "../utils/notification-helper.ts";

const router = express.Router();


// ----------------------
// 1️⃣ User: Post review for a product
// ----------------------
router.post("/", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { productId, rating, comment } = req.body;

  if (!productId || !rating) return res.status(400).json({ error: "Product and rating required" });

  const review = await prisma.review.create({
    data: { userId, productId, rating, comment },
    include: { product: { include: { seller: true } } }, // seller info
  });

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  // Email to seller
  await transporter.sendMail({
    from: `"My Store" <${process.env.EMAIL_USER}>`,
    to: review.product.seller.email,
    subject: `New Review for ${review.product.title}`,
    text: `${req.user!.name} posted a review: ${rating}⭐ - ${comment || "No comment"}`,
  });

  // Notification to seller
  await createNotification({
    sellerId: review.product.seller.id,
    message: `${req.user!.name} posted a review for ${review.product.title}`,
    link: `/seller/reviews/${review.id}`,
  });

  res.json({ message: "Review created & seller notified", review });
});

// ----------------------
// 2️⃣ User: Get reviews for a product with pagination, search, filter, sort
// ----------------------
router.get("/product/:id", authenticateToken, async (req: AuthRequest, res) => {
  const productId = Number(req.params.id);
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = String(req.query.search || "");
  const minRating = Number(req.query.minRating || 0);
  const maxRating = Number(req.query.maxRating || 5);
  const sort = String(req.query.sort || "desc"); // desc or asc
  const skip = (page - 1) * limit;

  const reviews = await prisma.review.findMany({
    where: {
      productId,
      comment: { contains: search, mode: "insensitive" },
      rating: { gte: minRating, lte: maxRating },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: sort as "asc" | "desc" },
    skip,
    take: limit,
  });

  const total = await prisma.review.count({
    where: {
      productId,
      comment: { contains: search, mode: "insensitive" },
      rating: { gte: minRating, lte: maxRating },
    },
  });

  res.json({ page, limit, total, reviews });
});

// ----------------------
// 3️⃣ Seller/Admin: Get reviews for their products (dashboard) with average rating
// ----------------------
router.get("/seller", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const sellerId = req.user!.id;

  const products = await prisma.product.findMany({
    where: { sellerId },
    include: { reviews: { include: { user: { select: { id: true, name: true } } } } },
  });

  const result = products.map(p => {
    const totalReviews = p.reviews.length;
    const avgRating = totalReviews
      ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    return {
      productId: p.id,
      title: p.title,
      totalReviews,
      avgRating: Number(avgRating.toFixed(2)),
      reviews: p.reviews,
    };
  });

  res.json({ products: result });
});

// ----------------------
// 4️⃣ Seller/Admin: Reply to a review
// ----------------------
router.post("/:reviewId/reply", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const reviewId = Number(req.params.reviewId);
  const { reply } = req.body;

  if (!reply) return res.status(400).json({ error: "Reply cannot be empty" });

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { reply },
    include: { user: true, product: { select: { title: true } } },
  });

  // Notification to user
  await createNotification({
    userId: updated.user.id,
    message: `Seller replied to your review on ${updated.product.title}`,
    link: `/reviews/${reviewId}`,
  });

  res.json({ message: "Reply added & user notified", updated });
});

// ----------------------
// 5️⃣ User: Get own reviews with pagination, search, filter, sort
// ----------------------
router.get("/me", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const search = String(req.query.search || "");
  const minRating = Number(req.query.minRating || 0);
  const maxRating = Number(req.query.maxRating || 5);
  const sort = String(req.query.sort || "desc");
  const skip = (page - 1) * limit;

  const reviews = await prisma.review.findMany({
    where: {
      userId,
      comment: { contains: search, mode: "insensitive" },
      rating: { gte: minRating, lte: maxRating },
    },
    include: { product: { select: { id: true, title: true } } },
    orderBy: { createdAt: sort as "asc" | "desc" },
    skip,
    take: limit,
  });

  const total = await prisma.review.count({
    where: {
      userId,
      comment: { contains: search, mode: "insensitive" },
      rating: { gte: minRating, lte: maxRating },
    },
  });

  res.json({ page, limit, total, reviews });
});

export default router;
