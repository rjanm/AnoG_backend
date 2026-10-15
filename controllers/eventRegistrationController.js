
import mongoose from "mongoose";
import Event from "../models/Event.js";
import EventRegistration from "../models/EventRegistration.js";

export const registerForEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID."
      });
    }

    if (req.user.role !== "attendee") {
      return res.status(403).json({
        success: false,
        message: "Only attendees can register for events."
      });
    }

    const event = await Event.findOne({
      _id: eventId,
      status: "published",
      isDeleted: { $ne: true }
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or not available."
      });
    }

    const now = new Date();

    if (event.startDate <= now || event.endDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Registration for this event has ended."
      });
    }

    if (
      event.registrationDeadline &&
      event.registrationDeadline <= now
    ) {
      return res.status(400).json({
        success: false,
        message: "The registration deadline has passed."
      });
    }

    const existingRegistration =
      await EventRegistration.findOne({
        event: eventId,
        attendee: req.user._id
      });

    if (existingRegistration?.status === "registered") {
      return res.status(409).json({
        success: false,
        message: "You are already registered for this event."
      });
    }

    const reservedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        status: "published",
        isDeleted: { $ne: true },
        startDate: { $gt: now },
        endDate: { $gt: now },
        $or: [
          { registrationDeadline: null },
          { registrationDeadline: { $gt: now } }
        ],
        $expr: {
          $lt: ["$registeredCount", "$capacity"]
        }
      },
      {
        $inc: { registeredCount: 1 }
      },
      { new: true }
    );

    if (!reservedEvent) {
      return res.status(400).json({
        success: false,
        message: "Registration is closed or the event is full."
      });
    }

    try {
      let registration;

      if (existingRegistration?.status === "cancelled") {
        registration = await EventRegistration.findOneAndUpdate(
          {
            _id: existingRegistration._id,
            status: "cancelled"
          },
          {
            $set: {
              status: "registered",
              registeredAt: new Date()
            }
          },
          { new: true }
        );

        if (!registration) {
          const conflict = new Error(
            "Registration status changed. Please refresh."
          );
          conflict.status = 409;
          throw conflict;
        }
      } else {
        registration = await EventRegistration.create({
          event: eventId,
          attendee: req.user._id,
          status: "registered"
        });
      }

      return res.status(201).json({
        success: true,
        message: "Successfully registered for the event!",
        registration,
        event: reservedEvent
      });
    } catch (error) {
      await Event.updateOne(
        { _id: eventId, registeredCount: { $gt: 0 } },
        { $inc: { registeredCount: -1 } }
      );

      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You are already registered for this event."
        });
      }

      throw error;
    }
  } catch (error) {
    console.error("Register event error:", error);

    return res.status(error.status || 500).json({
      success: false,
      message:
        error.status === 409
          ? error.message
          : "Unable to register for this event."
    });
  }
};

export const getMyRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.find({
      attendee: req.user._id,
      status: "registered"
    })
      .populate(
        "event",
        "title image category venue location startDate endDate status"
      )
      .sort({ registeredAt: -1 });

    return res.status(200).json({
      success: true,
      registrations
    });
  } catch (error) {
    console.error("Get registrations error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load registrations."
    });
  }
};

export const getRegistrationStatus = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID."
      });
    }

    const registration = await EventRegistration.findOne({
      event: eventId,
      attendee: req.user._id,
      status: "registered"
    });

    return res.status(200).json({
      success: true,
      isRegistered: Boolean(registration),
      registration
    });
  } catch (error) {
    console.error("Registration status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check registration status."
    });
  }
};
