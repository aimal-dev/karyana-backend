import express from "express";
import prisma from "../prismaClient.ts";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import transporter from "../utils/mailer.ts";
import createNotification from "../utils/notification-helper.ts";

const router = express.Router();

// ✅ Approve a seller
router.put("/sellers/:id/approve", authenticateToken, verifyRoles("ADMIN"), async (req, res) => {
  const sellerId = Number(req.params.id);
  
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) return res.status(404).json({ error: "Seller not found" });

  const updatedSeller = await prisma.seller.update({
    where: { id: sellerId },
    data: { approved: true },
  });

  // 1. Send Email to Seller
  try {
    await transporter.sendMail({
      from: `"Karyana Store" <${process.env.EMAIL_USER}>`,
      to: seller.email,
      subject: "Your Seller Account has been Approved!",
      text: `Congratulations ${seller.name}!\n\nYour seller account on Karyana Store has been approved by the admin. You can now log in and manage your products.\n\nLogin here: ${process.env.FRONTEND_URL}/seller-login`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #22c55e;">Account Approved!</h2>
          <p>Congratulations <b>${seller.name}</b>!</p>
          <p>Your seller account on Karyana Store has been approved by the admin. You can now log in and manage your products.</p>
          <a href="${process.env.FRONTEND_URL}/seller-login" style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 5px;">Login to Dashboard</a>
        </div>
      `
    });
  } catch (err) {
    console.error("Failed to send approval email:", err);
  }

  // 2. Create Internal Notification for Seller
  await createNotification({
    sellerId: updatedSeller.id,
    message: "Your account has been approved by the admin. Welcome aboard!",
    link: "/seller"
  });

  res.json({ message: "Seller approved, email and notification sent", updatedSeller });
});

// ✅ Reject a seller
router.put("/sellers/:id/reject", authenticateToken, verifyRoles("ADMIN"), async (req, res) => {
  const sellerId = Number(req.params.id);
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) return res.status(404).json({ error: "Seller not found" });

  const updatedSeller = await prisma.seller.update({
    where: { id: sellerId },
    data: { approved: false },
  });

  // Send Email to Seller
  try {
    await transporter.sendMail({
      from: `"Karyana Store" <${process.env.EMAIL_USER}>`,
      to: seller.email,
      subject: "Seller Account Update",
      text: `Hello ${seller.name},\n\nYour seller account application has been reviewed and rejected at this time. If you have any questions, please contact support.`,
    });
  } catch (err) {
    console.error("Failed to send rejection email:", err);
  }

  res.json({ message: "Seller rejected", updatedSeller });
});

// ✅ Change website settings
router.put("/settings", authenticateToken, verifyRoles("ADMIN"), async (req, res) => {
  const { logoUrl, storeName } = req.body;
  
  const settings = await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: { logoUrl, storeName },
    create: { id: 1, logoUrl, storeName }
  });

  res.json({ message: "Settings updated successfully", settings });
});

// ✅ Get website settings
router.get("/settings", async (req, res) => {
  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  res.json({ settings });
});

// ✅ Get all users (Admin & Seller can see customer list)
router.get("/users", authenticateToken, verifyRoles("ADMIN", "SELLER"), async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      address: true,
      city: true,
      phone: true,
      orders: {
        select: {
          total: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const usersWithSales = users.map(user => {
    const totalSales = user.orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const orderCount = user.orders.length;
    const { orders, ...userWithoutOrders } = user;
    return {
      ...userWithoutOrders,
      totalSales,
      orderCount
    };
  });

  res.json({ users: usersWithSales });
});

// ✅ Get all sellers (Admin management)
router.get("/sellers", authenticateToken, verifyRoles("ADMIN"), async (req, res) => {
  const { approved } = req.query;
  const where: any = {};
  
  if (approved !== undefined) {
    where.approved = approved === "true";
  }

  const sellers = await prisma.seller.findMany({
    where,
    orderBy: { createdAt: "desc" }
  });
  res.json({ sellers });
});

// ✅ Detailed Revenue Report (Per Product / Time Period)
router.get("/revenue-report", authenticateToken, verifyRoles("ADMIN"), async (req, res) => {
  const { startDate, endDate, productId } = req.query;

  const where: any = {
    order: { status: "DELIVERED" } // Usually revenue is counted on delivered orders
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(String(startDate));
    if (endDate) where.createdAt.lte = new Date(String(endDate));
  }

  if (productId) {
    where.productId = Number(productId);
  }

  const revenueData = await prisma.orderItem.findMany({
    where,
    include: {
      product: { select: { title: true, price: true } },
      order: { select: { createdAt: true } }
    }
  });

  // Aggregate by product
  const report: Record<number, any> = {};
  revenueData.forEach(item => {
    if (!report[item.productId]) {
      report[item.productId] = {
        productId: item.productId,
        title: item.product.title,
        totalQty: 0,
        totalRevenue: 0
      };
    }
    report[item.productId].totalQty += item.qty;
    report[item.productId].totalRevenue += item.qty * item.price;
  });

  res.json({ 
    totalItems: revenueData.length,
    products: Object.values(report)
  });
});

export default router;
