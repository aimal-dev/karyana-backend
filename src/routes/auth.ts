import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import prisma from "../prismaClient.js";
import { authenticateToken } from "../middlewares/auth.js";
import type { AuthRequest } from "../../types/AuthRequest.js";
import createNotification from "../utils/notification-helper.js";
import { sendWhatsAppMessage } from "../utils/whatsapp.js";

// ✅ Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

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
          phone: true,
          whatsappApiKey: true,
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

    // Notify Admin via WhatsApp
    const adminPhone = process.env.WHATSAPP_ADMIN_PHONE;
    const adminApiKey = process.env.WHATSAPP_ADMIN_API_KEY;
    if (adminPhone && adminApiKey) {
      const adminMsg = `👤 *New Buyer Registered*\n📛 Name: ${name}\n📧 Email: ${email}`;
      await sendWhatsAppMessage(adminPhone, adminMsg, adminApiKey);
    }

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

    // Notify Admin via WhatsApp
    const adminPhone = process.env.WHATSAPP_ADMIN_PHONE;
    const adminApiKey = process.env.WHATSAPP_ADMIN_API_KEY;
    if (adminPhone && adminApiKey) {
      const adminMsg = `🆕 *New Seller Application*\n👤 Name: ${name}\n📧 Email: ${email}\n\nPlease review in the admin dashboard.`;
      await sendWhatsAppMessage(adminPhone, adminMsg, adminApiKey);
    }

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
router.post("/admin-login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });

  const ADMIN_EMAIL = "admin@example.com";
  const ADMIN_PASSWORD = "admin123";

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ id: 0, role: "ADMIN", name: "System Admin" }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
    res.json({ message: "Admin login successful", token });
  } else {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }
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
  } else if (role === "ADMIN") {
     const admin = await prisma.user.findUnique({ where: { id: userId } });
     if (!admin) return res.status(404).json({ error: "Admin not found" });
     const match = await bcrypt.compare(currentPassword, admin.password);
     if (!match) return res.status(401).json({ error: "Incorrect current password" });
     const hashedPassword = await bcrypt.hash(newPassword, 10);
     // @ts-ignore
     await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
  } else {
     return res.status(403).json({ error: "Not allowed for this role" });
  }

  res.json({ message: "Password updated successfully" });
});

// ------------------ Update Profile ------------------
router.put("/profile", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { name, email, address, city, phone, whatsappApiKey } = req.body;

  try {
    if (role === "SELLER") {
      const seller = await prisma.seller.update({
        where: { id: userId },
        data: { name, email, phone, whatsappApiKey },
      });
      return res.json({ message: "Seller profile updated", user: { ...seller, role: "SELLER" } });
    }

    // Default to USER
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name, email, address, city, phone },
      select: { id: true, name: true, email: true, address: true, city: true, phone: true }
    });
    res.json({ message: "User profile updated", user: { ...user, role: "USER" } });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ------------------ Forgot Password ------------------
router.post("/forgot-password", async (req, res) => {
  const { email, role } = req.body; // role: USER or SELLER
  if (!email || !role) return res.status(400).json({ error: "Email and role are required" });

  try {
    let target;
    if (role === "SELLER") {
      target = await prisma.seller.findUnique({ where: { email } });
    } else {
      target = await prisma.user.findUnique({ where: { email } });
    }

    if (!target) {
      return res.status(404).json({ error: "User with this email not found" });
    }

    // Generate Token
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000); // 1 hour valid

    // Update DB
    if (role === "SELLER") {
      await prisma.seller.update({
        where: { id: target.id },
        data: { resetToken: token, resetTokenExpiry: expiry }
      });
    } else {
      await prisma.user.update({
        where: { id: target.id },
        data: { resetToken: token, resetTokenExpiry: expiry }
      });
    }

    // Send Email
    const origin = req.get('origin') || process.env.FRONTEND_URL || "http://localhost:3000";
    const frontendUrl = origin.replace(/\/$/, ""); // Remove trailing slash if any
    const resetUrl = `${frontendUrl}/reset-password?token=${token}&role=${role}`;
    
    await transporter.sendMail({
      from: `"Karyana Store" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset. Please click the button below to reset your password:</p>
          <a href="${resetUrl}" style="background: #80B500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 20px 0;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: "Password reset link sent to your email" });

  } catch (error: any) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Failed to process forgot password" });
  }
});

// ------------------ Reset Password ------------------
router.post("/reset-password", async (req, res) => {
  const { token, role, newPassword } = req.body;
  if (!token || !role || !newPassword) return res.status(400).json({ error: "All fields are required" });

  try {
    let target;
    if (role === "SELLER") {
      target = await prisma.seller.findFirst({
        where: { resetToken: token, resetTokenExpiry: { gte: new Date() } }
      });
    } else {
      target = await prisma.user.findFirst({
        where: { resetToken: token, resetTokenExpiry: { gte: new Date() } }
      });
    }

    if (!target) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update DB and clear token
    if (role === "SELLER") {
      await prisma.seller.update({
        where: { id: target.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null }
      });
    } else {
      await prisma.user.update({
        where: { id: target.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null }
      });
    }

    res.json({ message: "Password reset successful. You can now login." });

  } catch (error: any) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
