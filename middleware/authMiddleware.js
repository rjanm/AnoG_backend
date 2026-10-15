
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Please log in."
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing."
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: ["HS256"]
        }
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token."
      });
    }

    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token."
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists."
      });
    }

    if (user.isDeleted === true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message:
          "Your account has been deleted by an administrator. Please check your email for further information."
      });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_SUSPENDED",
        message:
          "This account has been suspended. Please contact the administrator."
      });
    }

    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Your account is currently inactive."
      });
    }

    req.user = user;

    return next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to authenticate your account."
    });
  }
};

export const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required."
    });
  }

  if (req.user.isDeleted === true) {
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_DELETED",
      message: "This account has been deleted."
    });
  }

  if (req.user.accountStatus !== "active") {
    return res.status(403).json({
      success: false,
      code: "ACCOUNT_INACTIVE",
      message: "Your account is currently inactive."
    });
  }

  if (req.user.emailVerified !== true) {
    return res.status(403).json({
      success: false,
      code: "EMAIL_NOT_VERIFIED",
      message:
        "Please verify your email address before continuing."
    });
  }

  return next();
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required."
      });
    }

    if (req.user.isDeleted === true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message: "This account has been deleted."
      });
    }

    if (req.user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Your account is not active."
      });
    }

    if (req.user.emailVerified !== true) {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Please verify your email address before continuing."
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to access this resource."
      });
    }

    return next();
  };
};

export const adminOnly = authorizeRoles("admin");

export const organizerOnly = authorizeRoles("organizer");

export const organizerOrAdmin = authorizeRoles(
  "organizer",
  "admin"
);
