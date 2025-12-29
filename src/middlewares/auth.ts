import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest } from "../../types/AuthRequest.js"; // agar types folder me rakha

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  const secret = process.env.JWT_SECRET || "secretkey";
  if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not defined in environment variables, using fallback.");
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      console.error("JWT Verification Failed:", err.message);
      return res.status(403).json({ 
        message: "Invalid token", 
        error: err.message,
        hint: "Clear your browser storage and login again."
      });
    }
    req.user = user; 
    next();
  });
};
// ✅ Role-based middleware
// export const verifyRoles = (role: string) => {
//   return (req: AuthRequest, res: Response, next: NextFunction) => {
//     if (!req.user) return res.status(401).json({ message: "Unauthorized" });
//     if (req.user.role !== role) return res.status(403).json({ message: "Forbidden" });
//     next();
//   };
// };
// multiple roles allow karne ke liye
export const verifyRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
};

