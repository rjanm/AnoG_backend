
import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required."],
      trim: true,
      minlength: 3,
      maxlength: 150
    },

    description: {
      type: String,
      required: [true, "Event description is required."],
      trim: true,
      maxlength: 10000
    },

    category: {
      type: String,
      required: [true, "Event category is required."],
      trim: true,
      maxlength: 100
    },

    image: {
      type: String,
      default: "",
      trim: true
    },

    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    venue: {
      type: String,
      required: [true, "Event venue is required."],
      trim: true,
      maxlength: 200
    },

    location: {
      type: String,
      required: [true, "Event location is required."],
      trim: true,
      maxlength: 500
    },

    startDate: {
      type: Date,
      required: [true, "Event start date is required."]
    },

    endDate: {
      type: Date,
      required: [true, "Event end date is required."],
      validate: {
        validator: function(value) {
          return (
            !this.startDate ||
            !value ||
            value > this.startDate
          );
        },
        message:
          "Event end date must be later than the start date."
      }
    },

    capacity: {
      type: Number,
      required: [true, "Event capacity is required."],
      min: [1, "Capacity must be at least 1."],
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number."
      }
    },

    registeredCount: {
      type: Number,
      default: 0,
      min: 0
    },

    isFree: {
      type: Boolean,
      default: true
    },

    ticketPrice: {
      type: Number,
      default: 0,
      min: 0
    },

    currency: {
      type: String,
      default: "PHP",
      enum: ["PHP"]
    },

    registrationDeadline: {
      type: Date,
      default: null
    },

    status: {
      type: String,
      enum: [
        "draft",
        "published",
        "cancelled",
        "completed"
      ],
      default: "draft",
      index: true
    },

    publishedAt: {
      type: Date,
      default: null
    },

    cancelledAt: {
      type: Date,
      default: null
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
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
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

eventSchema.index({
  organizer: 1,
  isDeleted: 1,
  createdAt: -1
});

eventSchema.index({
  status: 1,
  isDeleted: 1,
  startDate: 1
});

eventSchema.pre("validate", function() {
  if (this.isFree) {
    this.ticketPrice = 0;
  }

  if (
    !this.isFree &&
    this.ticketPrice <= 0
  ) {
    this.invalidate(
      "ticketPrice",
      "Paid events must have a ticket price greater than zero."
    );
  }

  if (
    this.registrationDeadline &&
    this.startDate &&
    this.registrationDeadline > this.startDate
  ) {
    this.invalidate(
      "registrationDeadline",
      "Registration deadline cannot be later than the event start date."
    );
  }

  if (this.registeredCount > this.capacity) {
    this.invalidate(
      "registeredCount",
      "Registered attendees cannot exceed event capacity."
    );
  }
});

const Event =
  mongoose.models.Event ||
  mongoose.model("Event", eventSchema);

export default Event;
