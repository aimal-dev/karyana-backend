import express from "express";
import { authenticateToken, verifyRoles } from "../middlewares/auth.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";
import prisma from "../prismaClient.ts";
import bcrypt from "bcryptjs";

const router = express.Router();

// Get current user profile
router.get("/profile", authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;
  res.json({ user });
});

// Get user details (with full data from DB)
router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approved: true,
      createdAt: true
    }
  });
  res.json({ user });
});

// Update profile (name, email)
router.put("/profile", authenticateToken, async (req: AuthRequest, res) => {
  const { name, email } = req.body;
  
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(email && { email })
      }
    });
    
    res.json({ message: "Profile updated successfully", user: updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password
router.put("/password", authenticateToken, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword }
    });
    
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update password" });
  }
});

// Get seller's customers (users who bought from this seller)
router.get("/seller-customers", authenticateToken, verifyRoles("SELLER", "ADMIN"), async (req: AuthRequest, res) => {
  try {
    // NEW Logic: Fetch ALL orders to aggregate customers (Global View)

    const orders = await prisma.order.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
        // items not needed if we use order.total
      }
    });
    
    // Aggregate customer data
    const customerMap = new Map();
    
    orders.forEach(order => {
      if (!order.user) return;
      
      const userId = order.user.id;
      if (!customerMap.has(userId)) {
        customerMap.set(userId, {
          id: userId,
          name: order.user.name,
          email: order.user.email,
          orderCount: 0,
          totalSales: 0
        });
      }
      
      const customer = customerMap.get(userId);
      customer.orderCount += 1;
      
      // Use order.total directly (it is a Float in the schema)
      customer.totalSales += order.total; 
    });
    
    const customers = Array.from(customerMap.values());
    
    res.json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

export default router;
