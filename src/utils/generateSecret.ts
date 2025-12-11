import crypto from "crypto";

// Generate 32-byte random secret key
const secret = crypto.randomBytes(32).toString("hex");

console.log("✅ Your new JWT secret key:");
console.log(secret);
