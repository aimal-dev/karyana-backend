import express from "express";
import prisma from "../prismaClient.js";

const router = express.Router();

// ✅ Get website settings (Public)
router.get("/", async (req, res) => {
  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  res.json({ settings });
});

export default router;
