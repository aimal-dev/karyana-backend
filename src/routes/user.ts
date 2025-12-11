import express from "express";
import { authenticateToken } from "../middlewares/auth.ts";
import type { AuthRequest } from "../../types/AuthRequest.ts";

const router = express.Router();

router.get("/profile", authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user; // decoded JWT payload
  res.json({ user });
});

export default router;
