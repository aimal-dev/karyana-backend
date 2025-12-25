import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient.ts";
import { authenticateToken } from "../middlewares/auth.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";
import createNotification from "../utils/notification-helper.ts";

const router = express.Router();

// ------------------ Test GET ------------------
router.get("/", (req, res) => {
  res.send("Auth route is working!");
});

// ------------------ Get Current User ------------------
router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    if (role === "ADMIN") {
      return res.json({ 
        user: { 
          id: 0, 
          name: "System Admin", 
          email: "admin@example.com", 
          role: "ADMIN" 
        } 
      });
    }

    if (role === "SELLER") {
      const seller = await prisma.seller.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      if (!seller) {
        return res.status(404).json({ error: "Seller not found" });
      }

      return res.json({ user: { ...seller, role: "SELLER" } });
    }

    // Default to USER
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        address: true,
        city: true,
        phone: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: { ...user, role: "USER" } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// ------------------ Buyer Register ------------------
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Notify Admin
    await createNotification({
      role: "ADMIN",
      message: `New Buyer Registered: ${name} (${email})`,
      link: "/admin/users"
    });

    res.json({ message: "User created", user });
  } catch (error: any) {
    console.error("User Register Error:", error);
    res.status(400).json({ 
      error: "Registration failed.", 
      details: error.message,
      code: error.code 
    });
  }
});

// ------------------ Buyer Login ------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  const token = jwt.sign({ id: user.id, role: "USER", name: user.name }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
  res.json({ message: "Login successful", token });
});

// ------------------ Seller Register ------------------
router.post("/seller-register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const seller = await prisma.seller.create({
      data: { name, email, password: hashedPassword, approved: false }, // initially not approved
    });

    // Notify Admin
    await createNotification({
      role: "ADMIN",
      message: `New Seller Application: ${name} (${email})`,
      link: "/admin/sellers"
    });

    res.json({ message: "Seller registered, wait for admin approval", seller });
  } catch (error: any) {
    console.error("Seller Register Error:", error);
    res.status(400).json({ 
      error: "Seller registration failed.", 
      details: error.message,
      code: error.code 
    });
  }
});

// ------------------ Seller Login ------------------
router.post("/seller-login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const seller = await prisma.seller.findUnique({ where: { email } });
  if (!seller) return res.status(404).json({ error: "Seller not found" });

  const match = await bcrypt.compare(password, seller.password);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  if (!seller.approved) return res.status(403).json({ error: "Seller not approved yet" });

  const token = jwt.sign({ id: seller.id, role: "SELLER", name: seller.name }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
  res.json({ message: "Seller login successful", token });
});

// ------------------ Admin Login (Hardcoded) ------------------
router.post("/admin-login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const ADMIN_EMAIL = "admin@example.com";
  const ADMIN_PASSWORD = "admin123";

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = jwt.sign({ id: 0, role: "ADMIN", name: "Super Admin" }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
  res.json({ message: "Admin login successful", token });
});

// ------------------ Change Password ------------------
router.put("/change-password", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body;
  const role = req.user!.role;

  if (!currentPassword || !newPassword) return res.status(400).json({ error: "All fields required" });
  if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  if (role === "USER") {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect current password" });
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
  } else if (role === "SELLER") { 
     const seller = await prisma.seller.findUnique({ where: { id: userId } });
     if (!seller) return res.status(404).json({ error: "Seller not found" });
     
     const match = await bcrypt.compare(currentPassword, seller.password);
     if (!match) return res.status(401).json({ error: "Incorrect current password" });

     const hashedPassword = await bcrypt.hash(newPassword, 10);
     await prisma.seller.update({ where: { id: userId }, data: { password: hashedPassword } });
  } else {
     return res.status(403).json({ error: "Not allowed for this role" });
  }

  res.json({ message: "Password updated successfully" });
});

// ------------------ Update Profile ------------------
router.put("/profile", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { address, city, phone } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { address, city, phone },
      select: { id: true, name: true, email: true, address: true, city: true, phone: true }
    });
    res.json({ message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
