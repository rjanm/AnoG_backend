
import mongoose from "mongoose";

const eventRegistrationSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true
    },

    attendee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    status: {
      type: String,
      enum: ["registered", "cancelled"],
      default: "registered"
    },

    registeredAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

eventRegistrationSchema.index(
  { event: 1, attendee: 1 },
  { unique: true }
);

const EventRegistration = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema
);

export default EventRegistration;
