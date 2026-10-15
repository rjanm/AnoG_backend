
import express from "express";

import {
  createEvent,
  getPublicEvents,
  getPublicEventById,
  getMyEvents,
  getAllEvents,
  getManagedEventById,
  updateEvent,
  publishEvent,
  unpublishEvent,
  cancelEvent,
  completeEvent,
  deleteEvent,
  getTrashedEvents,
  restoreEvent,
  permanentlyDeleteEvent
} from "../controllers/eventController.js";

import { protect } from "../middleware/authMiddleware.js";
import { uploadEventPoster } from "../middleware/eventUpload.js";

const eventRouter = express.Router();

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action."
    });
  }

  next();
};

const organizerOrAdmin = allowRoles(
  "organizer",
  "admin"
);

const adminOnly = allowRoles("admin");

eventRouter.get(
  "/public",
  getPublicEvents
);

eventRouter.get(
  "/public/:eventId",
  getPublicEventById
);

eventRouter.use(protect);

eventRouter.post(
  "/",
  organizerOrAdmin,
  uploadEventPoster,
  createEvent
);

eventRouter.get(
  "/mine",
  organizerOrAdmin,
  getMyEvents
);

eventRouter.get(
  "/manage/:eventId",
  organizerOrAdmin,
  getManagedEventById
);

eventRouter.put(
  "/:eventId",
  organizerOrAdmin,
  uploadEventPoster,
  updateEvent
);

eventRouter.patch(
  "/:eventId/publish",
  organizerOrAdmin,
  publishEvent
);

eventRouter.patch(
  "/:eventId/unpublish",
  organizerOrAdmin,
  unpublishEvent
);

eventRouter.patch(
  "/:eventId/cancel",
  organizerOrAdmin,
  cancelEvent
);

eventRouter.patch(
  "/:eventId/complete",
  organizerOrAdmin,
  completeEvent
);

eventRouter.delete(
  "/:eventId",
  organizerOrAdmin,
  deleteEvent
);

eventRouter.get(
  "/admin/all",
  adminOnly,
  getAllEvents
);

eventRouter.get(
  "/trash",
  organizerOrAdmin,
  getTrashedEvents
);

eventRouter.patch(
  "/trash/:eventId/restore",
  organizerOrAdmin,
  restoreEvent
);

eventRouter.delete(
  "/trash/:eventId/permanent",
  adminOnly,
  permanentlyDeleteEvent
);

export default eventRouter;
