
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      lowercase: true,
      unique: true,
      match: [
        /^[a-z0-9_]{3,30}$/,
        "Username must contain 3–30 letters, numbers, or underscores."
      ]
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: value =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: "Please enter a valid email address."
      }
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    emailVerifiedAt: {
      type: Date,
      default: null
    },

    emailVerificationCodeHash: {
      type: String,
      default: null,
      select: false
    },

    emailVerificationExpiresAt: {
      type: Date,
      default: null,
      select: false
    },

    emailVerificationAttempts: {
      type: Number,
      default: 0,
      select: false
    },

    emailVerificationLastSentAt: {
      type: Date,
      default: null,
      select: false
    },

    emailVerificationSendCount: {
      type: Number,
      default: 0,
      select: false
    },

    emailVerificationWindowStart: {
      type: Date,
      default: null,
      select: false
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    fullName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    phoneNumber: {
      type: String,
      default: "",
      trim: true,
      maxlength: 20,
      validate: {
        validator: value =>
          !value || /^\+?[0-9]{7,15}$/.test(value),
        message: "Please enter a valid phone number."
      }
    },

    profilePicture: {
      type: String,
      default: ""
    },

    profilePicturePublicId: {
      type: String,
      default: "",
      select: false
    },

    pendingEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
      select: false,
      validate: {
        validator: value =>
          !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: "Please enter a valid new email address."
      }
    },

    pendingEmailCodeHash: {
      type: String,
      default: null,
      select: false
    },

    pendingEmailExpiresAt: {
      type: Date,
      default: null,
      select: false
    },

    pendingEmailAttempts: {
      type: Number,
      default: 0,
      select: false
    },

    pendingEmailLastSentAt: {
      type: Date,
      default: null,
      select: false
    },

    role: {
      type: String,
      enum: ["attendee", "organizer", "admin"],
      default: "attendee",
      required: true
    },

    accountStatus: {
      type: String,
      enum: ["active", "suspended"],
      default: "active"
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date,
      default: null
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    deletionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },

    deletionEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "not_required"],
      default: "not_required"
    },

    deletionEmailSentAt: {
      type: Date,
      default: null
    },

    organizerApplicationStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none"
    },

    organizerAppliedAt: {
      type: Date,
      default: null
    },

    organizerReviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" }
    }
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (password) {
  if (!this.password) {
    throw new Error("Password was not loaded.");
  }

  return bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
