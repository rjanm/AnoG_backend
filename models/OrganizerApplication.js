
import mongoose from "mongoose";

const organizerApplicationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    organizationName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ""
    },

    organizationType: {
      type: String,
      enum: [
        "individual",
        "school",
        "business",
        "organization",
        "other"
      ],
      required: true
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 2000
    },

    experience: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    reviewNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

organizerApplicationSchema.index(
  { applicant: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "pending"
    }
  }
);

const OrganizerApplication = mongoose.model(
  "OrganizerApplication",
  organizerApplicationSchema
);

export default OrganizerApplication;
