import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import sellerRoutes from "./routes/seller.js";
import productRoutes from "./routes/product.js";
import categoryRoutes from "./routes/category.js";
import complaintRoutes from "./routes/complaint.js";
import orderRoutes from "./routes/order.js";
import reviewRoutes from "./routes/review.js";
import userRoutes from "./routes/user.js";
import cartRoutes from "./routes/cart.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notification.js";
import testMailRouter from "./routes/testMail.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { authenticateToken, verifyRoles } from "./middlewares/auth.js";


const app = express();

// CORS Configuration - Allow frontend to access backend
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://karyana-store.netlify.app"
  ],
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

// PUBLIC SETTINGS
app.use("/settings", settingsRoutes);

// NOT USED: UPLOAD logic moved to Client-side Base64 for stability
// app.use("/api/upload", uploadRoutes);


app.listen(5000, () => console.log("Server running on port 5000"));

export default app;
