
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/mongodb.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import organizerRoutes from "./routes/organizerRoutes.js";
import eventRouter from "./routes/eventRoutes.js";
import eventRegistrationRoutes from "./routes/eventRegistrationRoutes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173"
].filter(Boolean);

app.disable("x-powered-by");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ANO G Event Management API is running."
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    application: "ANO G Event Management System"
  });
});

app.use("/api/auth", authRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/organizer", organizerRoutes);
app.use("/api/event-registrations", eventRegistrationRoutes);
app.use("/api/events", eventRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  if (error.message === "CORS origin not allowed") {
    return res.status(403).json({
      success: false,
      message: "This website is not allowed to access the API."
    });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request."
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

const startServer = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in backend/.env.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT_SECRET in backend/.env.");
  }

  if (!process.env.EMAIL_USER) {
    throw new Error("Missing EMAIL_USER in backend/.env.");
  }

  if (!process.env.EMAIL_APP_PASSWORD) {
    throw new Error(
      "Missing EMAIL_APP_PASSWORD in backend/.env."
    );
  }

  await connectDB();

  app.listen(PORT, () => {
    console.log("====================================");
    console.log("ANO G? EVENT MANAGEMENT SYSTEM");
    console.log("====================================");
    console.log(`API running on port ${PORT}`);
    console.log("MongoDB connected.");
    console.log("Gmail SMTP configuration found.");
    console.log("Authentication routes initialized.");
    console.log("Admin routes initialized.");
    console.log("Organizer routes initialized.");
    console.log("Event Management routes initialized.");
    console.log("====================================");
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
