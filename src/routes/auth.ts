import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prismaClient.ts";

const router = express.Router();

// ------------------ Test GET ------------------
router.get("/", (req, res) => {
  res.send("Auth route is working!");
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
    res.json({ message: "User created", user });
  } catch (error) {
    res.status(400).json({ error: "Email already exists" });
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

  const token = jwt.sign({ id: user.id, role: "USER" }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
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
    res.json({ message: "Seller registered, wait for admin approval", seller });
  } catch (error) {
    res.status(400).json({ error: "Email already exists" });
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

  const token = jwt.sign({ id: seller.id, role: "SELLER" }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
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

  const token = jwt.sign({ id: 0, role: "ADMIN" }, process.env.JWT_SECRET || "secretkey", { expiresIn: "7d" });
  res.json({ message: "Admin login successful", token });
});

export default router;
