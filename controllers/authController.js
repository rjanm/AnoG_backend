
import jwt from "jsonwebtoken";
import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { validationResult } from "express-validator";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import { sendVerificationEmail } from "../services/emailService.js";

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const normalizeUsername = value =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeEmail = value =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeFullName = value =>
  typeof value === "string" ? value.trim() : "";

const normalizePhone = value =>
  typeof value === "string" ? value.replace(/[\s()-]/g, "") : "";

const isValidUsername = value =>
  /^[a-z0-9_]{3,30}$/.test(value);

const isValidEmail = value =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidPassword = value =>
  typeof value === "string" &&
  value.length >= 10 &&
  value.length <= 128 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

const isValidPhone = value =>
  !value || /^\+?[0-9]{7,15}$/.test(value);

const generateToken = id =>
  jwt.sign(
    { id: id.toString() },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      algorithm: "HS256"
    }
  );

const formatUser = user => ({
  id: user._id.toString(),
  username: user.username,
  email: user.email || "",
  emailVerified: Boolean(user.emailVerified),
  emailVerifiedAt: user.emailVerifiedAt || null,
  fullName: user.fullName || "",
  phoneNumber: user.phoneNumber || "",
  profilePicture: user.profilePicture || "",
  role: user.role === "user" ? "attendee" : user.role,
  accountStatus: user.accountStatus || "active",
  organizerApplicationStatus: user.organizerApplicationStatus || "none",
  organizerAppliedAt: user.organizerAppliedAt || null,
  organizerReviewedAt: user.organizerReviewedAt || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({
    success: false,
    message: errors.array()[0].msg,
    errors: errors.array()
  });

  return true;
};

const handleError = (res, error, fallback) => {
  if (error.code === 11000) {
    const email =
      error.keyPattern?.email || error.keyValue?.email;

    return res.status(409).json({
      success: false,
      code: email
        ? "EMAIL_ALREADY_REGISTERED"
        : "USERNAME_ALREADY_REGISTERED",
      message: email
        ? "This email address is already registered."
        : "This username is already taken."
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message:
        Object.values(error.errors)[0]?.message ||
        "Invalid information."
    });
  }

  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      success: false,
      message: error.message
    });
  }

  console.error("[AUTH]", fallback, error);

  return res.status(500).json({
    success: false,
    message: fallback
  });
};

const hashCode = (userId, code, purpose = "signup") => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  const input =
    purpose === "signup"
      ? `${userId}:${code}`
      : `${userId}:${purpose}:${code}`;

  return createHmac("sha256", process.env.JWT_SECRET)
    .update(input)
    .digest("hex");
};

const createCode = () =>
  String(randomInt(0, 1000000)).padStart(6, "0");

const compareHashes = (submitted, stored) => {
  if (
    typeof submitted !== "string" ||
    typeof stored !== "string" ||
    !/^[a-f0-9]{64}$/i.test(stored)
  ) {
    return false;
  }

  const a = Buffer.from(submitted, "hex");
  const b = Buffer.from(stored, "hex");

  return a.length === b.length && timingSafeEqual(a, b);
};

const otpFields = [
  "emailVerificationCodeHash",
  "emailVerificationExpiresAt",
  "emailVerificationAttempts",
  "emailVerificationLastSentAt",
  "emailVerificationSendCount",
  "emailVerificationWindowStart"
];

const otpSelection = otpFields
  .map(field => `+${field}`)
  .join(" ");

const sendNewVerificationCode = async user => {
  if (user.emailVerified) {
    throw Object.assign(
      new Error("Email is already verified."),
      { status: 400 }
    );
  }

  if (!user.email) {
    throw Object.assign(
      new Error("No email address is associated with this account."),
      { status: 400 }
    );
  }

  const now = new Date();

  if (
    user.emailVerificationLastSentAt &&
    now.getTime() -
      new Date(user.emailVerificationLastSentAt).getTime() <
      RESEND_COOLDOWN_MS
  ) {
    throw Object.assign(
      new Error("Please wait 60 seconds before requesting another code."),
      { status: 429 }
    );
  }

  const expired =
    !user.emailVerificationWindowStart ||
    now.getTime() -
      new Date(user.emailVerificationWindowStart).getTime() >=
      SEND_WINDOW_MS;

  const count = expired
    ? 0
    : Number(user.emailVerificationSendCount || 0);

  if (count >= MAX_SENDS_PER_HOUR) {
    throw Object.assign(
      new Error("Too many verification emails. Please try again later."),
      { status: 429 }
    );
  }

  const snapshot = Object.fromEntries(
    otpFields.map(field => [field, user[field]])
  );

  const code = createCode();

  user.emailVerificationCodeHash = hashCode(user._id, code);
  user.emailVerificationExpiresAt = new Date(
    now.getTime() + CODE_EXPIRY_MS
  );
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = now;
  user.emailVerificationSendCount = count + 1;
  user.emailVerificationWindowStart = expired
    ? now
    : user.emailVerificationWindowStart;

  await user.save();

  try {
    return await sendVerificationEmail(
      user.email,
      user.fullName || user.username,
      code
    );
  } catch (error) {
    const rollback = Object.fromEntries(
      otpFields.map(field => [
        field,
        snapshot[field] ?? null
      ])
    );

    try {
      await User.updateOne(
        {
          _id: user._id,
          emailVerified: false,
          emailVerificationCodeHash:
            user.emailVerificationCodeHash
        },
        { $set: rollback }
      );
    } catch (rollbackError) {
      console.error(
        "[OTP] Rollback failed:",
        rollbackError.message
      );
    }

    throw error;
  }
};

const loadActiveUser = async (req, res, selection = "") => {
  const query = User.findById(req.user._id);

  if (selection) query.select(selection);

  const user = await query;

  if (!user) {
    res.status(404).json({
      success: false,
      message: "User not found."
    });
    return null;
  }

  if (user.accountStatus === "suspended") {
    res.status(403).json({
      success: false,
      message: "This account has been suspended."
    });
    return null;
  }

  return user;
};

const clearPendingEmail = user => {
  user.pendingEmail = null;
  user.pendingEmailCodeHash = null;
  user.pendingEmailExpiresAt = null;
  user.pendingEmailAttempts = 0;
  user.pendingEmailLastSentAt = null;
};

export const checkAvailability = async (req, res) => {
  try {
    const email = normalizeEmail(req.query?.email);
    const username = normalizeUsername(req.query?.username);

    if (!email && !username) {
      return res.status(400).json({
        success: false,
        message: "Email or username is required."
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    if (username && !isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must contain 3–30 letters, numbers, or underscores."
      });
    }

    const result = { success: true };

    if (email) {
      result.emailAvailable = !(await User.exists({ email }));
    }

    if (username) {
      result.usernameAvailable = !(await User.exists({ username }));
    }

    return res.status(200).json(result);
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to check account availability."
    );
  }
};

export const register = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const username = normalizeUsername(req.body?.username);
    const email = normalizeEmail(req.body?.email);
    const fullName = normalizeFullName(req.body?.fullName);
    const password = req.body?.password;

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must contain 3–30 letters, numbers, or underscores."
      });
    }

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain 1–100 characters."
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain 10–128 characters, uppercase, lowercase, number, and special character."
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_ALREADY_REGISTERED",
        message:
          "This email address is already registered. Please sign in."
      });
    }

    if (await User.exists({ username })) {
      return res.status(409).json({
        success: false,
        code: "USERNAME_ALREADY_REGISTERED",
        message:
          "This username is already taken. Choose another username."
      });
    }

    const user = await User.create({
      username,
      email,
      fullName,
      password,
      role: "attendee",
      accountStatus: "active",
      emailVerified: false,
      organizerApplicationStatus: "none"
    });

    let emailSent = false;

    try {
      await sendNewVerificationCode(user);
      emailSent = true;
    } catch (error) {
      console.error(
        "[AUTH] Registration OTP delivery failed:",
        error.message
      );
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Account created. Please check your email for your verification code."
        : "Account created, but the verification email could not be sent. Please request another code.",
      emailSent,
      token: generateToken(user._id),
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to create account."
    );
  }
};

export const login = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const username = normalizeUsername(req.body?.username);
    const password = req.body?.password;

    if (!username || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
    }

    const user = await User.findOne({ username })
      .select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been suspended. Please contact support."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token: generateToken(user._id),
      user: formatUser(user),
      requiresEmailVerification: !user.emailVerified
    });
  } catch (error) {
    return handleError(res, error, "Unable to log in.");
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await loadActiveUser(req, res);

    if (!user) return;

    return res.status(200).json({
      success: true,
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to retrieve profile."
    );
  }
};

export const updateProfile = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const user = await loadActiveUser(req, res);

    if (!user) return;

    const hasName = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "fullName"
    );

    const hasPhone = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "phoneNumber"
    );

    if (!hasName && !hasPhone) {
      return res.status(400).json({
        success: false,
        message: "No profile changes were provided."
      });
    }

    if (hasName) {
      const fullName = normalizeFullName(req.body.fullName);

      if (!fullName || fullName.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Full name must contain 1–100 characters."
        });
      }

      user.fullName = fullName;
    }

    if (hasPhone) {
      const phoneNumber = normalizePhone(
        req.body.phoneNumber
      );

      if (!isValidPhone(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid phone number."
        });
      }

      user.phoneNumber = phoneNumber;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to update profile."
    );
  }
};

export const changeUsername = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const username = normalizeUsername(req.body?.username);
    const currentPassword = req.body?.currentPassword;

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must contain 3–30 letters, numbers, or underscores."
      });
    }

    if (
      typeof currentPassword !== "string" ||
      !currentPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password is required."
      });
    }

    const user = await loadActiveUser(
      req,
      res,
      "+password"
    );

    if (!user) return;

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    if (user.username === username) {
      return res.status(200).json({
        success: true,
        message: "Username is already up to date.",
        user: formatUser(user)
      });
    }

    if (
      await User.exists({
        username,
        _id: { $ne: user._id }
      })
    ) {
      return res.status(409).json({
        success: false,
        code: "USERNAME_ALREADY_REGISTERED",
        message: "This username is already taken."
      });
    }

    user.username = username;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Username updated successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to change username."
    );
  }
};

export const changePassword = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;

    if (
      typeof currentPassword !== "string" ||
      !currentPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password is required."
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must contain 10–128 characters, uppercase, lowercase, number, and special character."
      });
    }

    if (
      confirmPassword !== undefined &&
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match."
      });
    }

    const user = await loadActiveUser(
      req,
      res,
      "+password"
    );

    if (!user) return;

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    if (await user.comparePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from your current password."
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully."
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to change password."
    );
  }
};

export const requestEmailChange = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const email = normalizeEmail(req.body?.email);
    const currentPassword = req.body?.currentPassword;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid new email address."
      });
    }

    if (
      typeof currentPassword !== "string" ||
      !currentPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password is required."
      });
    }

    const user = await loadActiveUser(
      req,
      res,
      "+password +pendingEmail +pendingEmailCodeHash +pendingEmailExpiresAt +pendingEmailAttempts +pendingEmailLastSentAt"
    );

    if (!user) return;

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    if (email === user.email) {
      return res.status(400).json({
        success: false,
        message:
          "This is already your registered email address."
      });
    }

    if (
      await User.exists({
        email,
        _id: { $ne: user._id }
      })
    ) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_ALREADY_REGISTERED",
        message: "This email address is already registered."
      });
    }

    const now = Date.now();

    if (
      user.pendingEmailLastSentAt &&
      now -
        new Date(user.pendingEmailLastSentAt).getTime() <
        RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Please wait 60 seconds before requesting another code."
      });
    }

    const code = createCode();

    const codeHash = hashCode(
      user._id,
      code,
      `email-change:${email}`
    );

    const previous = {
      pendingEmail: user.pendingEmail,
      pendingEmailCodeHash: user.pendingEmailCodeHash,
      pendingEmailExpiresAt: user.pendingEmailExpiresAt,
      pendingEmailAttempts: user.pendingEmailAttempts,
      pendingEmailLastSentAt: user.pendingEmailLastSentAt
    };

    user.pendingEmail = email;
    user.pendingEmailCodeHash = codeHash;
    user.pendingEmailExpiresAt = new Date(
      now + CODE_EXPIRY_MS
    );
    user.pendingEmailAttempts = 0;
    user.pendingEmailLastSentAt = new Date(now);

    await user.save();

    try {
      await sendVerificationEmail(
        email,
        user.fullName || user.username,
        code
      );
    } catch (emailError) {
      try {
        await User.updateOne(
          {
            _id: user._id,
            pendingEmailCodeHash: codeHash
          },
          {
            $set: {
              pendingEmail: previous.pendingEmail ?? null,
              pendingEmailCodeHash:
                previous.pendingEmailCodeHash ?? null,
              pendingEmailExpiresAt:
                previous.pendingEmailExpiresAt ?? null,
              pendingEmailAttempts:
                previous.pendingEmailAttempts ?? 0,
              pendingEmailLastSentAt:
                previous.pendingEmailLastSentAt ?? null
            }
          }
        );
      } catch (rollbackError) {
        console.error(
          "[AUTH] Email change rollback failed:",
          rollbackError
        );
      }

      return res.status(502).json({
        success: false,
        message:
          "Unable to send verification email to the new address."
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "A verification code has been sent to your new email address.",
      pendingEmail: email
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to request email change."
    );
  }
};

export const confirmEmailChange = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const code = String(req.body?.code || "").trim();

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid six-digit verification code."
      });
    }

    const user = await loadActiveUser(
      req,
      res,
      "+pendingEmail +pendingEmailCodeHash +pendingEmailExpiresAt +pendingEmailAttempts"
    );

    if (!user) return;

    if (
      !user.pendingEmail ||
      !user.pendingEmailCodeHash ||
      !user.pendingEmailExpiresAt
    ) {
      return res.status(400).json({
        success: false,
        message: "No pending email change was found."
      });
    }

    if (
      new Date(user.pendingEmailExpiresAt).getTime() <=
      Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification code has expired. Request another code."
      });
    }

    if (
      Number(user.pendingEmailAttempts || 0) >=
      MAX_VERIFY_ATTEMPTS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Request another code."
      });
    }

    const submittedHash = hashCode(
      user._id,
      code,
      `email-change:${user.pendingEmail}`
    );

    if (
      !compareHashes(
        submittedHash,
        user.pendingEmailCodeHash
      )
    ) {
      user.pendingEmailAttempts =
        Number(user.pendingEmailAttempts || 0) + 1;

      await user.save();

      return res.status(400).json({
        success: false,
        message: "Incorrect verification code."
      });
    }

    const newEmail = user.pendingEmail;

    if (
      await User.exists({
        email: newEmail,
        _id: { $ne: user._id }
      })
    ) {
      return res.status(409).json({
        success: false,
        message: "This email address is already registered."
      });
    }

    user.email = newEmail;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationAttempts = 0;

    clearPendingEmail(user);

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Email address changed and verified successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to confirm email change."
    );
  }
};

export const verifyEmail = async (req, res) => {
  try {
    if (sendValidationErrors(req, res)) return;

    const code = req.body?.code;

    if (
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid six-digit verification code."
      });
    }

    const user = await loadActiveUser(
      req,
      res,
      "+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttempts"
    );

    if (!user) return;

    if (user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: "Email is already verified.",
        user: formatUser(user)
      });
    }

    if (
      !user.emailVerificationCodeHash ||
      !user.emailVerificationExpiresAt ||
      new Date(
        user.emailVerificationExpiresAt
      ).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification code has expired. Request a new code."
      });
    }

    if (
      Number(user.emailVerificationAttempts || 0) >=
      MAX_VERIFY_ATTEMPTS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Request a new code."
      });
    }

    const submittedHash = hashCode(user._id, code);

    if (
      !compareHashes(
        submittedHash,
        user.emailVerificationCodeHash
      )
    ) {
      user.emailVerificationAttempts =
        Number(user.emailVerificationAttempts || 0) + 1;

      await user.save();

      return res.status(400).json({
        success: false,
        message:
          user.emailVerificationAttempts >=
          MAX_VERIFY_ATTEMPTS
            ? "Too many incorrect attempts. Request a new code."
            : "Incorrect verification code."
      });
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationAttempts = 0;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Your email has been verified successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to verify email."
    );
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const user = await loadActiveUser(
      req,
      res,
      otpSelection
    );

    if (!user) return;

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Your email is already verified."
      });
    }

    await sendNewVerificationCode(user);

    return res.status(200).json({
      success: true,
      message:
        "A new verification code has been sent to your email.",
      emailSent: true
    });
  } catch (error) {
    console.error(
      "[OTP] Resend verification error:",
      error.message
    );

    return res.status(error.status || 502).json({
      success: false,
      message: error.status
        ? error.message
        : "Unable to send verification email. Please try again later."
    });
  }
};

const detectImageType = buffer => {
  if (!Buffer.isBuffer(buffer)) return null;

  if (
    buffer.length >= 3 &&
    buffer.subarray(0, 3).equals(
      Buffer.from([0xff, 0xd8, 0xff])
    )
  ) {
    return "jpg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return "png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
};

const uploadCloudinaryBuffer = (buffer, userId) =>
  new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;

      if (error) return reject(error);

      if (!result?.secure_url || !result?.public_id) {
        return reject(
          new Error(
            "Cloudinary returned an invalid upload response."
          )
        );
      }

      resolve(result);
    };

    try {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ano-g/profile-pictures",
          public_id: `user-${userId}-${Date.now()}`,
          resource_type: "image",
          overwrite: false,
          transformation: [
            {
              width: 600,
              height: 600,
              crop: "limit"
            }
          ]
        },
        (error, result) => finish(error, result)
      );

      stream.on("error", error => finish(error));
      stream.end(buffer);
    } catch (error) {
      finish(error);
    }
  });

export const uploadProfilePicture = async (req, res) => {
  let uploadedPublicId = null;
  let stage = "loading user";

  try {
    const user = await loadActiveUser(
      req,
      res,
      "+profilePicturePublicId"
    );

    if (!user) return;

    stage = "validating image";

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile picture."
      });
    }

    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Profile picture must not exceed 2 MB."
      });
    }

    const detected = detectImageType(req.file.buffer);

    const mimeByType = {
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp"
    };

    if (
      !detected ||
      mimeByType[detected] !== req.file.mimetype
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please upload a valid JPG, PNG, or WebP image."
      });
    }

    const missingVariables = [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET"
    ].filter(key => !process.env[key]?.trim());

    if (missingVariables.length > 0) {
      console.error(
        "[PROFILE] Missing Cloudinary variables:",
        missingVariables
      );

      return res.status(503).json({
        success: false,
        message: "Image upload service is not configured."
      });
    }

    stage = "uploading to Cloudinary";

    console.log("[PROFILE] Starting Cloudinary upload:", {
      userId: user._id.toString(),
      fileType: req.file.mimetype,
      fileSize: req.file.size
    });

    const uploaded = await uploadCloudinaryBuffer(
      req.file.buffer,
      user._id.toString()
    );

    uploadedPublicId = uploaded.public_id;

    console.log(
      "[PROFILE] Cloudinary upload successful."
    );

    const oldPublicId = user.profilePicturePublicId;

    user.profilePicture = uploaded.secure_url;
    user.profilePicturePublicId = uploadedPublicId;

    stage = "saving to MongoDB";

    console.log(
      "[PROFILE] Saving profile picture to MongoDB."
    );

    await user.save();

    uploadedPublicId = null;

    console.log(
      "[PROFILE] Profile picture saved successfully."
    );

    if (
      typeof oldPublicId === "string" &&
      oldPublicId.startsWith("ano-g/profile-pictures/")
    ) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: "image"
        });
      } catch (cleanupError) {
        console.error(
          "[PROFILE] Previous image cleanup failed:",
          cleanupError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    console.error("[PROFILE] Upload failed:", {
      stage,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      httpCode: error?.http_code
    });

    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(
          uploadedPublicId,
          { resource_type: "image" }
        );
      } catch (cleanupError) {
        console.error(
          "[PROFILE] Upload cleanup failed:",
          cleanupError.message
        );
      }
    }

    return handleError(
      res,
      error,
      "Unable to upload profile picture."
    );
  }
};

export const removeProfilePicture = async (req, res) => {
  try {
    const user = await loadActiveUser(
      req,
      res,
      "+profilePicturePublicId"
    );

    if (!user) return;

    const oldPublicId = user.profilePicturePublicId;

    user.profilePicture = "";
    user.profilePicturePublicId = "";

    await user.save();

    if (
      typeof oldPublicId === "string" &&
      oldPublicId.startsWith("ano-g/profile-pictures/")
    ) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, {
          resource_type: "image"
        });
      } catch (cleanupError) {
        console.error(
          "[PROFILE] Image removal cleanup failed:",
          cleanupError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture removed successfully.",
      user: formatUser(user)
    });
  } catch (error) {
    return handleError(
      res,
      error,
      "Unable to remove profile picture."
    );
  }
};
