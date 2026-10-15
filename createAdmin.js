import dns from "node:dns";
import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const createAdmin = async () => {
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in .env");
    }

    if (!email) {
      throw new Error("INITIAL_ADMIN_EMAIL is missing in .env");
    }

    if (!password) {
      throw new Error("INITIAL_ADMIN_PASSWORD is missing in .env");
    }

    if (
      password.length < 10 ||
      password.length > 128 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      throw new Error(
        "Admin password must be 10-128 characters with uppercase, lowercase, number, and special character."
      );
    }

    console.log("Connecting to MongoDB Atlas...");

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000
    });

    console.log("MongoDB connected successfully!");

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("An account already exists with this email.");
      console.log("No changes were made.");
      console.log("Existing role:", existingUser.role);
      return;
    }

    const username = "anogadmin";

    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      throw new Error(
        "Username anogadmin is already taken. Choose another username in the script."
      );
    }

    const admin = new User({
      username,
      email,
      password,
      fullName: "ANO G Administrator",
      role: "admin",
      accountStatus: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      organizerApplicationStatus: "none"
    });

    await admin.save();

    console.log("====================================");
    console.log("ADMIN ACCOUNT CREATED SUCCESSFULLY!");
    console.log("====================================");
    console.log("Username:", admin.username);
    console.log("Email:", admin.email);
    console.log("Role:", admin.role);
    console.log("Status:", admin.accountStatus);
    console.log("====================================");
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();