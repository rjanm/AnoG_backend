
import express from "express";
import { body } from "express-validator";

import {
  register,
  login,
  getProfile,
  updateProfile,
  verifyEmail,
  resendVerificationEmail,
  checkAvailability,
  changeUsername,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  uploadProfilePicture,
  removeProfilePicture
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

import {
  uploadProfilePicture as uploadProfileMiddleware
} from "../middleware/uploadProfile.js";

const router = express.Router();

const passwordRules = [
  body("password")
    .isString()
    .withMessage("Password is required.")
    .bail()
    .isLength({ min: 10, max: 128 })
    .withMessage("Password must contain 10 to 128 characters.")
    .matches(/[A-Z]/)
    .withMessage("Include an uppercase letter.")
    .matches(/[a-z]/)
    .withMessage("Include a lowercase letter.")
    .matches(/[0-9]/)
    .withMessage("Include a number.")
    .matches(/[^A-Za-z0-9]/)
    .withMessage("Include a special character.")
];

const usernameRules = [
  body("username")
    .isString()
    .withMessage("Username is required.")
    .bail()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must contain 3 to 30 characters.")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Only letters, numbers, and underscores are allowed.")
];

const emailRules = [
  body("email")
    .isString()
    .withMessage("Email address is required.")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address.")
    .isLength({ max: 254 })
    .withMessage("Email address is too long.")
    .normalizeEmail({
      gmail_remove_dots: false,
      gmail_remove_subaddress: false
    })
];

const currentPasswordRules = [
  body("currentPassword")
    .isString()
    .withMessage("Current password is required.")
    .bail()
    .notEmpty()
    .withMessage("Current password is required.")
];

const verificationCodeRules = [
  body("code")
    .isString()
    .withMessage("Verification code is required.")
    .bail()
    .matches(/^[0-9]{6}$/)
    .withMessage("Enter the 6-digit verification code.")
];

router.get(
  "/check-availability",
  checkAvailability
);

router.post(
  "/register",
  [
    ...usernameRules,

    body("fullName")
      .isString()
      .withMessage("Full name is required.")
      .bail()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Full name must contain 1 to 100 characters."),

    ...emailRules,
    ...passwordRules
  ],
  register
);

router.post(
  "/login",
  [
    body("username")
      .isString()
      .withMessage("Username is required.")
      .bail()
      .trim()
      .notEmpty()
      .withMessage("Username is required."),

    body("password")
      .isString()
      .withMessage("Password is required.")
      .bail()
      .notEmpty()
      .withMessage("Password is required.")
  ],
  login
);

router.get(
  "/profile",
  protect,
  getProfile
);

router.put(
  "/profile",
  protect,
  [
    body("fullName")
      .optional()
      .isString()
      .withMessage("Full name must be text.")
      .bail()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Full name must contain 1 to 100 characters."),

    body("phoneNumber")
      .optional()
      .isString()
      .withMessage("Phone number must be text.")
      .bail()
      .trim()
      .custom(value => {
        const normalized = value.replace(/[\s()-]/g, "");

        if (
          normalized &&
          !/^\+?[0-9]{7,15}$/.test(normalized)
        ) {
          throw new Error("Please enter a valid phone number.");
        }

        return true;
      })
  ],
  updateProfile
);

router.post(
  "/profile/picture",
  protect,
  uploadProfileMiddleware,
  uploadProfilePicture
);

router.delete(
  "/profile/picture",
  protect,
  removeProfilePicture
);

router.put(
  "/change-username",
  protect,
  [
    ...usernameRules,
    ...currentPasswordRules
  ],
  changeUsername
);

router.put(
  "/change-password",
  protect,
  [
    ...currentPasswordRules,

    body("newPassword")
      .isString()
      .withMessage("New password is required.")
      .bail()
      .isLength({ min: 10, max: 128 })
      .withMessage("Password must contain 10 to 128 characters.")
      .matches(/[A-Z]/)
      .withMessage("Include an uppercase letter.")
      .matches(/[a-z]/)
      .withMessage("Include a lowercase letter.")
      .matches(/[0-9]/)
      .withMessage("Include a number.")
      .matches(/[^A-Za-z0-9]/)
      .withMessage("Include a special character."),

    body("confirmPassword")
      .optional()
      .isString()
      .withMessage("Confirm password must be text.")
  ],
  changePassword
);

router.post(
  "/request-email-change",
  protect,
  [
    ...emailRules,
    ...currentPasswordRules
  ],
  requestEmailChange
);

router.post(
  "/confirm-email-change",
  protect,
  verificationCodeRules,
  confirmEmailChange
);

router.post(
  "/verify-email",
  protect,
  verificationCodeRules,
  verifyEmail
);

router.post(
  "/resend-verification",
  protect,
  resendVerificationEmail
);

export default router;
