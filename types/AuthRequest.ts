import type { Request } from "express";

// Custom Request type
export interface AuthRequest extends Request {
  user?: any;  // ya type define kar do { id: number, role: string } etc.
}
