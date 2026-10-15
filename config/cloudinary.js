
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

const requiredVariables = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
];

const missingVariables = requiredVariables.filter(
  key => !process.env[key]?.trim()
);

if (missingVariables.length > 0) {
  console.error(
    "[CLOUDINARY] Missing environment variables:",
    missingVariables.join(", ")
  );
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });

  console.log("[CLOUDINARY] Configuration loaded.");
}

export default cloudinary;
