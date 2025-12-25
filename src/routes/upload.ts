import express from "express";
import multer from "multer";
import path from "path";
import { authenticateToken } from "../middlewares/auth.ts";

const router = express.Router();

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpeg, jpg, png, webp) are allowed!"));
  }
});

router.post("/", authenticateToken, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please upload a file" });
  }

  // Generate URL for the uploaded file
  // In production, this would be your domain
  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  
  res.json({ 
    message: "File uploaded successfully",
    url: fileUrl 
  });
});

export default router;
