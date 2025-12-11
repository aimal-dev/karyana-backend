import express from "express";
import transporter from "../utils/mailer.ts";
const router = express.Router();

const adminEmails = (process.env.ADMIN_EMAIL || "")
  .split(",")
  .map((e: string) => e.trim()); 


// POST /test-mail
router.post("/", async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({ error: "to, subject, and message required" });
  }

  try {
    await transporter.sendMail({
      from: `"My Store" <${process.env.EMAIL_USER}>`,
      to: adminEmails, // <-- split aur trim
      cc: adminEmails,
      subject,
      text: message,
    });

    res.json({ message: "Test email sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
