// src/routes/dashboard.ts
import express from "express";
import prisma from "../prismaClient.ts";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";

const router = express.Router();

/* -----------------------------
   1️⃣ USER DASHBOARD SUMMARY
----------------------------- */
router.get(
  "/user",
  authenticateToken,
  verifyRoles("USER"),
  async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalSpentAgg,
      totalReviews,
      totalComplaints,
      unreadNotifications,
    ] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.order.count({ where: { userId, status: "PENDING" } }),
      prisma.order.count({ where: { userId, status: "DELIVERED" } }),

      prisma.order.aggregate({
        _sum: { total: true },
        where: { userId },
      }),

      prisma.review.count({ where: { userId } }),
      prisma.complaint.count({ where: { userId } }),

      prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    const totalSpent = totalSpentAgg._sum.total || 0;

    res.json({
      user: {
        id: userId,
        name: (req.user as any).name || null,
        role: req.user!.role,
      },
      stats: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        totalSpent,
        reviews: {
          total: totalReviews,
        },
        complaints: {
          total: totalComplaints,
        },
        unreadNotifications,
      },
    });
  },
);

/* -----------------------------
   2️⃣ SELLER DASHBOARD SUMMARY
   (products + orders + revenue + reviews + complaints)
----------------------------- */
router.get(
  "/seller",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const sellerId = req.user!.id;

    const [
      totalProducts,
      totalCategories,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      revenueAgg,
      totalReviews,
      totalComplaints,
      openComplaints,
      unreadNotifications,
    ] = await Promise.all([
      prisma.product.count({ where: { sellerId } }),
      prisma.category.count({ where: { sellerId } }),

      // jitne orders me is seller ke products hain
      prisma.order.count({
        where: { items: { some: { product: { sellerId } } } },
      }),

      prisma.order.count({
        where: {
          status: "PENDING",
          items: { some: { product: { sellerId } } },
        },
      }),

      prisma.order.count({
        where: {
          status: "DELIVERED",
          items: { some: { product: { sellerId } } },
        },
      }),

      // Revenue: sum of order.total for all orders containing this seller's products
      prisma.order.aggregate({
        _sum: { total: true },
        where: { items: { some: { product: { sellerId } } } },
      }),

      // Total reviews on seller's products
      prisma.review.count({
        where: { product: { sellerId } },
      }),

      // Complaints related to seller's products/orders
      prisma.complaint.count({
        where: {
          OR: [
            { product: { sellerId } },
            { order: { items: { some: { product: { sellerId } } } } },
          ],
        },
      }),

      // Open/PENDING complaints
      prisma.complaint.count({
        where: {
          status: "PENDING",
          OR: [
            { product: { sellerId } },
            { order: { items: { some: { product: { sellerId } } } } },
          ],
        },
      }),

      prisma.notification.count({
        where: { sellerId, read: false },
      }),
    ]);

    const totalRevenue = revenueAgg._sum.total || 0;

    res.json({
      seller: {
        id: sellerId,
        role: req.user!.role,
      },
      stats: {
        totalProducts,
        totalCategories,
        totalOrders,
        pendingOrders,
        deliveredOrders,
        totalRevenue,
        reviews: {
          total: totalReviews,
        },
        complaints: {
          total: totalComplaints,
          open: openComplaints,
        },
        unreadNotifications,
      },
    });
  },
);

/* -----------------------------
   3️⃣ ADMIN DASHBOARD SUMMARY
   (users + sellers + products + orders + revenue + reviews + complaints)
----------------------------- */
router.get(
  "/admin",
  authenticateToken,
  verifyRoles("ADMIN"),
  async (req: AuthRequest, res) => {
    const [
      totalUsers,
      totalSellers,
      approvedSellers,
      pendingSellers,
      totalProducts,
      totalCategories,
      totalOrders,
      pendingOrders,
      processingOrders,
      deliveredOrders,
      cancelledOrders,
      paymentFailedOrders,
      revenueAgg,
      totalReviews,
      totalComplaints,
      openComplaints,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.seller.count(),
      prisma.seller.count({ where: { approved: true } }),
      prisma.seller.count({ where: { approved: false } }),

      prisma.product.count(),
      prisma.category.count(),

      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "PROCESSING" } }),
      prisma.order.count({ where: { status: "DELIVERED" } }),
      prisma.order.count({ where: { status: "CANCELLED" } }),
      prisma.order.count({ where: { status: "PAYMENT_FAILED" } }),

      // Revenue from successful payments
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "SUCCESS" },
      }),

      prisma.review.count(),
      prisma.complaint.count(),
      prisma.complaint.count({ where: { status: "PENDING" } }),
    ]);

    const totalRevenue = revenueAgg._sum.amount || 0;

    const [recentUsers, recentOrders, recentPendingSellers] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, createdAt: true },
      }),

      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          user: { select: { id: true, name: true, email: true } },
          payment: true,
        },
      }),

      prisma.seller.findMany({
        where: { approved: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
    ]);

    res.json({
      admin: {
        id: req.user!.id, // auth.ts me admin-login id=0 de raha
        role: req.user!.role,
      },
      stats: {
        users: {
          total: totalUsers,
        },
        sellers: {
          total: totalSellers,
          approved: approvedSellers,
          pending: pendingSellers,
        },
        catalog: {
          totalProducts,
          totalCategories,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          processing: processingOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
          paymentFailed: paymentFailedOrders,
        },
        revenue: {
          totalRevenue,
        },
        reviews: {
          total: totalReviews,
        },
        complaints: {
          total: totalComplaints,
          open: openComplaints,
        },
      },
      recent: {
        users: recentUsers,
        orders: recentOrders,
        pendingSellers: recentPendingSellers,
      },
    });
  },
);

export default router;