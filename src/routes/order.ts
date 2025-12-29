// src/routes/order.ts

import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.js";
import prisma from "../prismaClient.js";
import type { AuthRequest } from "../../types/AuthRequest.js";
import nodemailer from "nodemailer";
import createNotification from "../utils/notification-helper.js";

const router = express.Router();

type OrderItemInput = {
  productId: number;
  qty: number;
};

// ✅ Nodemailer transporter (sirf ek baar)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ✅ Admin emails (.env se, comma-separated)
const adminEmails = (process.env.ADMIN_EMAIL || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

/* --------------------------------------------------
   1️⃣ USER: Get all orders (pagination + filters)
-------------------------------------------------- */
router.get("/", authenticateToken, verifyRoles("USER", "SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  const { page = 1, limit = 10, status, startDate, endDate, search, userId: queryUserId } = req.query;

  const where: any = {};
  
  if (req.user!.role === "USER") {
    where.userId = req.user!.id;
  } else if (queryUserId) {
    where.userId = Number(queryUserId);
  }

  if (status) where.status = String(status);

  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(String(startDate)),
      lte: new Date(String(endDate)),
    };
  }

  if (search) {
    where.items = {
      some: {
        product: {
          title: {
            contains: String(search),
            mode: "insensitive",
          },
        },
      },
    };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: { 
        items: { include: { product: true } }, 
        payment: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, total, page: Number(page), limit: Number(limit) });
});

/* --------------------------------------------------
   2️⃣ USER: Create manual order (optional)
-------------------------------------------------- */
router.post("/", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const items: OrderItemInput[] = req.body.items;

  if (!items || !items.length) {
    return res.status(400).json({ error: "No items provided" });
  }

  const products = await Promise.all(
    items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })),
  );

  for (let i = 0; i < products.length; i++) {
    if (!products[i]) {
      return res.status(404).json({ error: `Product ${items[i].productId} not found` });
    }
  }

  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += products[i]!.price * items[i].qty;
  }

  const order = await prisma.order.create({
    data: {
      userId,
      total,
      status: "PENDING",
      items: {
        create: items.map((i, idx) => ({
          productId: i.productId,
          qty: i.qty,
          price: products[idx]!.price,
        })),
      },
    },
    include: { items: { include: { product: true } } },
  });

  res.json({ message: "Order created", order });
});



/* --------------------------------------------------
   3️⃣ USER: Checkout (Cart → Order + Payment + Emails + Notifications)
-------------------------------------------------- */
router.post("/checkout", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { method, address, city, phone } = req.body;

    console.log("Checkout initiated for user:", userId);

    if (!method || !address || !city || !phone) {
      return res.status(400).json({ error: "All fields (method, address, city, phone) are required" });
    }

    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { include: { seller: true } },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // ✅ Stock check
    for (const item of cart.items) {
      if (item.qty > item.product.stock) {
        return res
          .status(400)
          .json({ error: `Not enough stock for ${item.product.title}` });
      }
    }

    const total = cart.items.reduce((sum, item) => sum + item.qty * item.product.price, 0);

    // ✅ Minimal Transaction
    const newOrder = await prisma.$transaction(async (tx) => {
      // 1. Create Order
      const order = await tx.order.create({
        data: {
          userId,
          total,
          status: "PENDING",
          shippingAddress: address,
          shippingCity: city,
          shippingPhone: phone,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              price: item.product.price,
            })),
          },
        },
      });

      // 2. Create Payment
      await tx.payment.create({
        data: {
          orderId: order.id,
          method,
          amount: total,
          status: "PENDING",
        },
      });

      // 3. Update Stock
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.qty } },
        });
      }

      // 4. Clear Cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    console.log("Order created successfully:", newOrder.id);

    // ✅ Note: Emails and notifications are temporarily disabled to isolate the 500 error
    
    return res.json({
      success: true,
      message: "Order placed successfully!",
      order: {
        id: newOrder.id,
        total: newOrder.total
      }
    });

  } catch (err: any) {
    console.error("CRITICAL CHECKOUT ERROR:", err);
    return res.status(500).json({
      error: "Checkout Process Failed",
      message: err.message || "Unknown Error",
      prismaCode: err.code, // Useful for debugging Prisma issues
      meta: err.meta,
      suggestion: "Please ensure your live database is updated (npx prisma db push)"
    });
  }
});

/* --------------------------------------------------
   4️⃣ USER: Delete order
-------------------------------------------------- */
router.delete("/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (order.userId !== userId) {
    return res.status(403).json({ error: "Not allowed" });
  }
  if (order.status !== "PENDING") {
    return res
      .status(400)
      .json({ error: "Only pending orders can be deleted" });
  }

  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.order.delete({ where: { id: orderId } });

  res.json({ message: "Order deleted successfully" });
});

/* --------------------------------------------------
   5️⃣ SELLER/ADMIN: Product-wise orders (pagination + filters)
-------------------------------------------------- */
router.get(
  "/seller",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const sellerId = req.user!.id;
    const { page = 1, limit = 10, status, startDate, endDate, search } =
      req.query;

    const whereOrder: any = {};
    if (status) whereOrder.status = String(status);
    if (startDate && endDate) {
      whereOrder.createdAt = {
        gte: new Date(String(startDate)),
        lte: new Date(String(endDate)),
      };
    }
    if (search) {
      whereOrder.items = {
        some: {
          product: {
            title: {
              contains: String(search),
              mode: "insensitive",
            },
          },
        },
      };
    }

    const products = await prisma.product.findMany({
      where: { sellerId },
      include: {
        orderItems: {
          where: whereOrder,
          include: {
            order: {
              include: {
                items: { include: { product: true } },
                payment: true,
              },
            },
          },
        },
      },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    const totalOrders = await prisma.orderItem.count({
      where: { product: { sellerId } },
    });

    const result = products.map((p) => ({
      productId: p.id,
      title: p.title,
      orders: p.orderItems.map((oi) => ({
        orderId: oi.orderId,
        qty: oi.qty,
        price: oi.price,
        userId: oi.order.userId,
        status: oi.order.status,
        createdAt: oi.order.createdAt,
      })),
    }));

    res.json({
      products: result,
      totalOrders,
      page: Number(page),
      limit: Number(limit),
    });
  },
);

/* --------------------------------------------------
   6️⃣ SELLER/ADMIN: Update order status + email + notification
-------------------------------------------------- */
router.put(
  "/:id/status",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { user: true, payment: true },
    });

    // If order is delivered, automatically mark payment as success
    if (status === "DELIVERED" && updated.payment) {
      await prisma.payment.update({
        where: { id: updated.payment.id },
        data: { status: "SUCCESS" }
      });
    }

    await prisma.trackingHistory.create({
      data: {
        orderId: updated.id,
        status,
        message: `Order moved to ${status}`,
      },
    });

    const info = await transporter.sendMail({
      from: `"My Store" <${process.env.EMAIL_USER}>`,
      to: updated.user.email,
      subject: `Order #${updated.id} Status Updated`,
      text: `Your order status has been updated to: ${status}.`,
    });

    // console.log("status mail:", info.accepted, info.rejected);

    await createNotification({
      userId: updated.user.id,
      message: `Your order #${updated.id} status updated to: ${status}.`,
      link: `/orders/${updated.id}`,
    });

    res.json({
      message: "Order status updated, email & notification sent",
      updated,
    });
  },
);

/* --------------------------------------------------
   7️⃣ SELLER/ADMIN/USER: Tracking
-------------------------------------------------- */

router.post("/tracking", authenticateToken, verifyRoles("SELLER"), async (req, res) => {
  try {
    const { orderId, status, message } = req.body;

    // 1. Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { payment: true }
    });

    // If order is delivered, automatically mark payment as success
    if (status === "DELIVERED" && updatedOrder.payment) {
      await prisma.payment.update({
        where: { id: updatedOrder.payment.id },
        data: { status: "SUCCESS" }
      });
    }

    // 2. Add tracking history record
    const track = await prisma.trackingHistory.create({
      data: {
        orderId,
        status,
        message
      }
    });

    return res.json({
      success: true,
      message: "Tracking updated and payment synced",
      track
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({ error: err.message });
  }
});



/* --------------------------------------------------
   7️⃣ SELLER/ADMIN: Order tracking status 
-------------------------------------------------- */

router.get(
  "/:id/tracking",
  authenticateToken,
  verifyRoles("USER", "SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const orderId = Number(req.params.id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trackingHistory: {
          orderBy: { createdAt: "asc" }, // timeline shape
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      orderId: order.id,
      currentStatus: order.status,
      tracking: order.trackingHistory,
    });
  }
);



/* --------------------------------------------------
   7️⃣ SELLER/ADMIN: Order stats for charts
-------------------------------------------------- */
router.get(
  "/stats",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const { range } = req.query;
    const userId = req.user!.id;

    let startDate = new Date();
    let endDate = new Date();

    switch (range) {
      case "daily":
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "weekly": {
        const day = startDate.getDay();
        startDate.setDate(startDate.getDate() - day);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case "monthly":
        startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        endDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        break;
      case "yearly":
        startDate = new Date(startDate.getFullYear(), 0, 1);
        endDate = new Date(startDate.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        return res.status(400).json({ error: "Invalid range" });
    }

    const whereCondition: any = {
      createdAt: { gte: startDate, lte: endDate },
    };

    if (req.user!.role === "SELLER") {
      whereCondition.items = { some: { product: { sellerId: userId } } };
    }

    const stats = await prisma.order.groupBy({
      by: ["createdAt"],
      _sum: { total: true },
      where: whereCondition,
    });

    res.json({ stats });
  },
);

/* --------------------------------------------------
   8️⃣ SELLER/ADMIN: View orders of a specific user
-------------------------------------------------- */
router.get(
  "/user/:userId",
  authenticateToken,
  verifyRoles("SELLER", "ADMIN"),
  async (req: AuthRequest, res) => {
    const sellerId = req.user!.id;
    const userId = Number(req.params.userId);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        items: { some: { product: { sellerId } } },
      },
      include: { items: { include: { product: true } }, payment: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ orders });
  },
);

/* --------------------------------------------------
   USER: Get single order
-------------------------------------------------- */
router.get("/:id", authenticateToken, verifyRoles("USER"), async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);

  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid ID" });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      payment: true,
      trackingHistory: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== userId) return res.status(403).json({ error: "Not allowed" });

  res.json({ order });
});

export default router;