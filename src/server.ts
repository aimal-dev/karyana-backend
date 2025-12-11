import express from "express";
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

import { authenticateToken, verifyRoles } from "./middlewares/auth.ts";    


const app = express();
app.use(express.json());

// AUTH
app.use("/auth", authRoutes);

// SELLER
app.use("/seller", authenticateToken, verifyRoles("SELLER", "ADMIN"), sellerRoutes);

// ADMIN
app.use("/ADMIN", authenticateToken, verifyRoles("ADMIN"), adminRoutes);

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


app.listen(5000, () => console.log("Server running on port 5000"));
