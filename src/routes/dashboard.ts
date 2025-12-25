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
   (Now matches Admin's visibility as per request)
----------------------------- */
router.get(
  "/seller",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    // Note: We are removing the restrictive sellerId filters to provide global visibility
    // same as Admin, except for notifications which stay personal.

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
      totalCustomersAgg,
      last7DaysSales,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),

      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "DELIVERED" } }),

      prisma.order.aggregate({
        _sum: { total: true },
      }),

      prisma.review.count(),
      prisma.complaint.count(),
      prisma.complaint.count({ where: { status: "PENDING" } }),

      prisma.notification.count({
        where: { 
          OR: [
            { sellerId: req.user!.id },
            { role: req.user!.role }
          ],
          read: false 
        },
      }),

      // Total Unique Customers
      prisma.order.groupBy({
        by: ['userId'],
      }),

      // Last 7 Days Sales Data
      prisma.order.groupBy({
        by: ['createdAt'],
        _sum: { total: true },
        where: { 
          createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 7)) }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const recentOrders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        user: { select: { name: true, email: true } },
        items: {
          include: { product: { select: { title: true } } }
        }
      }
    });

    const totalRevenue = revenueAgg._sum.total || 0;
    const totalCustomers = totalCustomersAgg.length;

    // Process chart data
    const dailySales = last7DaysSales.reduce((acc: any, curr: any) => {
      const date = curr.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + (curr._sum.total || 0);
      return acc;
    }, {});

    const chartData = Object.entries(dailySales).map(([date, total]) => ({
      date,
      sales: total
    }));

    res.json({
      seller: {
        id: req.user!.id,
        role: req.user!.role,
      },
      stats: {
        totalProducts,
        totalCategories,
        totalOrders,
        pendingOrders,
        deliveredOrders,
        totalRevenue,
        totalCustomers,
        chartData,
        reviews: {
          total: totalReviews,
        },
        complaints: {
          total: totalComplaints,
          open: openComplaints,
        },
        unreadNotifications,
      },
      recentOrders
    });
  },
);

/* -----------------------------
   3️⃣ ADMIN DASHBOARD SUMMARY
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
      last7DaysSalesAdmin,
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

      // Last 7 Days Sales Data for Admin
      prisma.order.groupBy({
        by: ['createdAt'],
        _sum: { total: true },
        where: { 
          createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 7)) }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const totalRevenue = revenueAgg._sum.amount || 0;
    const successRate = totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : "0";

    const dailySalesAdmin = last7DaysSalesAdmin.reduce((acc: any, curr: any) => {
      const date = curr.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + (curr._sum.total || 0);
      return acc;
    }, {});

    const chartDataAdmin = Object.entries(dailySalesAdmin).map(([date, total]) => ({
      date,
      sales: total
    }));

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
        id: req.user!.id,
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
        successRate,
        chartData: chartDataAdmin,
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