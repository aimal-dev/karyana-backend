import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.ts";
import sellerRoutes from "./routes/seller.ts";
import productRoutes from "./routes/product.ts";
import categoryRoutes from "./routes/category.ts";
import complaintRoutes from "./routes/complaint.ts";
import orderRoutes from "./routes/order.ts";
import reviewRoutes from "./routes/review.ts";
import userRoutes from "./routes/user.ts";
import cartRoutes from "./routes/cart.ts";
import adminRoutes from "./routes/admin.ts";
import notificationRoutes from "./routes/notification.ts";
import testMailRouter from "./routes/testMail.ts";
import dashboardRoutes from "./routes/dashboard.ts";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { authenticateToken, verifyRoles } from "./middlewares/auth.ts";


const app = express();

// CORS Configuration - Allow frontend to access backend
app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? [process.env.FRONTEND_URL || "https://yourdomain.com"] // Production: Only your domain
    : ["http://localhost:3000", "http://localhost:3001"], // Development: localhost
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Static folder for file uploads
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// AUTH
app.use("/auth", authRoutes);

// SELLER
app.use("/seller", authenticateToken, verifyRoles("SELLER", "ADMIN"), sellerRoutes);

// ADMIN
app.use("/admin", authenticateToken, verifyRoles("ADMIN"), adminRoutes);

// PRODUCT
app.use("/products", productRoutes);

// CATEGORY
app.use("/category", categoryRoutes);

// COMPLAINTS
app.use("/complaints", complaintRoutes);

// ORDERS
app.use("/orders", orderRoutes);

// REVIEWS
app.use("/reviews", reviewRoutes);

// USER
app.use("/user", userRoutes);

// CART
app.use("/cart", cartRoutes);

// NOTIFICATION
app.use("/notification", notificationRoutes);

// TESTMAIL
app.use("/test-mail", testMailRouter);

// DASHBOARD
app.use("/dashboard", dashboardRoutes);

// NOT USED: UPLOAD logic moved to Client-side Base64 for stability
// app.use("/api/upload", uploadRoutes);


app.listen(5000, () => console.log("Server running on port 5000"));
