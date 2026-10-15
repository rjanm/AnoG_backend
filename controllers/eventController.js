
import mongoose from "mongoose";
import Event from "../models/Event.js";
import cloudinary from "../config/cloudinary.js";

const validId = id => mongoose.isValidObjectId(id);

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message
  });

const isAdmin = user => user?.role === "admin";
const isOrganizer = user => user?.role === "organizer";
const canManageEvents = user =>
  isAdmin(user) || isOrganizer(user);

const activeEvents = {
  isDeleted: { $ne: true }
};

const eventFields = [
  "title",
  "description",
  "category",
  "venue",
  "location",
  "startDate",
  "endDate",
  "capacity",
  "isFree",
  "ticketPrice",
  "registrationDeadline"
];

const populatedOrganizer =
  "username fullName email profilePicture role";

const getCloudinaryPublicId = imageUrl => {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(imageUrl);

    if (
      url.hostname !== "cloudinary.com" &&
      !url.hostname.endsWith(".cloudinary.com")
    ) {
      return null;
    }

    const marker = "/upload/";
    const index = url.pathname.indexOf(marker);

    if (index === -1) return null;

    let path = url.pathname.slice(index + marker.length);

    path = path.replace(/^v\d+\//, "");
    path = decodeURIComponent(path);
    path = path.replace(/\.[^./]+$/, "");

    if (!path.startsWith("ano-g/events/")) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
};

const deleteEventImage = async imageUrl => {
  const publicId = getCloudinaryPublicId(imageUrl);

  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image"
    });
  } catch (error) {
    console.error("Event image deletion error:", error);
  }
};

const uploadEventImage = async file => {
  if (!file?.buffer) {
    const error = new Error("Invalid event poster.");
    error.status = 400;
    throw error;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error(
      "Only JPG, PNG, and WEBP images are supported."
    );
    error.status = 400;
    throw error;
  }

  if (file.size > 5 * 1024 * 1024) {
    const error = new Error(
      "Event poster must not exceed 5 MB."
    );
    error.status = 400;
    throw error;
  }

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ano-g/events",
        resource_type: "image"
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.on("error", reject);
    uploadStream.end(file.buffer);
  });

  if (!result?.secure_url) {
    throw new Error(
      "Cloudinary did not return an image URL."
    );
  }

  return result.secure_url;
};

const buildEventData = body => {
  const data = {};

  for (const field of eventFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        field
      )
    ) {
      data[field] = body[field];
    }
  }

  for (const field of [
    "title",
    "description",
    "category",
    "venue",
    "location"
  ]) {
    if (typeof data[field] === "string") {
      data[field] = data[field].trim();
    }
  }

  if (data.isFree !== undefined) {
    data.isFree =
      data.isFree === true ||
      data.isFree === "true";
  }

  if (data.capacity !== undefined) {
    data.capacity =
      data.capacity === ""
        ? NaN
        : Number(data.capacity);
  }

  if (data.ticketPrice !== undefined) {
    data.ticketPrice =
      data.ticketPrice === ""
        ? NaN
        : Number(data.ticketPrice);
  }

  if (data.registrationDeadline === "") {
    data.registrationDeadline = null;
  }

  return data;
};

const validateEventInput = (
  data,
  requireFuture = true
) => {
  if (
    !data.title ||
    !data.description ||
    !data.category ||
    !data.venue ||
    !data.location ||
    !data.startDate ||
    !data.endDate ||
    data.capacity === undefined
  ) {
    return "Please complete all required event fields.";
  }

  if (data.title.length < 3) {
    return "Event title must contain at least 3 characters.";
  }

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return "Invalid event date.";
  }

  if (end <= start) {
    return "Event end date must be later than the start date.";
  }

  if (requireFuture && start <= new Date()) {
    return "Event start date must be in the future.";
  }

  if (
    !Number.isInteger(Number(data.capacity)) ||
    Number(data.capacity) < 1
  ) {
    return "Capacity must be a whole number greater than zero.";
  }

  if (data.registrationDeadline) {
    const deadline = new Date(
      data.registrationDeadline
    );

    if (
      Number.isNaN(deadline.getTime()) ||
      deadline > start
    ) {
      return "Registration deadline must be on or before the event start date.";
    }
  }

  if (
    data.isFree === false &&
    (
      !Number.isFinite(Number(data.ticketPrice)) ||
      Number(data.ticketPrice) <= 0
    )
  ) {
    return "Paid events must have a valid ticket price greater than zero.";
  }

  return null;
};

const getEventForManagement = async (
  eventId,
  user,
  includeDeleted = false
) => {
  const filter = {
    _id: eventId
  };

  if (!includeDeleted) {
    Object.assign(filter, activeEvents);
  }

  if (!isAdmin(user)) {
    filter.organizer = user._id;
  }

  return Event.findOne(filter);
};

export const createEvent = async (req, res) => {
  let uploadedImage = "";

  try {
    if (!canManageEvents(req.user)) {
      return sendError(
        res,
        403,
        "Only organizers and administrators can create events."
      );
    }

    const data = buildEventData(req.body || {});
    const validationError = validateEventInput(data);

    if (validationError) {
      return sendError(res, 400, validationError);
    }

    if (req.file) {
      uploadedImage = await uploadEventImage(req.file);
      data.image = uploadedImage;
    }

    const event = await Event.create({
      ...data,
      organizer: req.user._id,
      status: "draft",
      isDeleted: false,
      registeredCount: 0,
      publishedAt: null
    });

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      event
    });
  } catch (error) {
    console.error("CREATE EVENT ERROR:", error);
    console.error("ERROR MESSAGE:", error.message);
    console.error("ERROR STACK:", error.stack);

    if (uploadedImage) {
      await deleteEventImage(uploadedImage);
    }

    if (error.name === "ValidationError") {
      return sendError(res, 400, error.message);
    }

    if (error.name === "CastError") {
      return sendError(
        res,
        400,
        "Invalid event information."
      );
    }

    if (error.status === 400) {
      return sendError(res, 400, error.message);
    }

    return sendError(
      res,
      500,
      "Unable to create event. Please try again."
    );
  }
};

export const getPublicEvents = async (req, res) => {
  try {
    const now = new Date();

    const events = await Event.find({
      ...activeEvents,
      status: "published",
      endDate: { $gt: now }
    })
      .populate("organizer", populatedOrganizer)
      .sort({ startDate: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: events.length,
      events
    });
  } catch (error) {
    console.error("Get public events error:", error);

    return sendError(
      res,
      500,
      "Unable to load events."
    );
  }
};

export const getPublicEventById = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    const event = await Event.findOne({
      _id: eventId,
      ...activeEvents,
      status: "published"
    })
      .populate("organizer", populatedOrganizer)
      .lean();

    if (!event) {
      return sendError(res, 404, "Event not found.");
    }

    return res.status(200).json({
      success: true,
      event
    });
  } catch (error) {
    console.error("Get public event error:", error);

    return sendError(
      res,
      500,
      "Unable to load event."
    );
  }
};

export const getMyEvents = async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const events = await Event.find({
      organizer: req.user._id,
      ...activeEvents
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: events.length,
      events
    });
  } catch (error) {
    console.error("Get my events error:", error);

    return sendError(
      res,
      500,
      "Unable to load your events."
    );
  }
};

export const getAllEvents = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return sendError(
        res,
        403,
        "Administrator access required."
      );
    }

    const events = await Event.find(activeEvents)
      .populate("organizer", populatedOrganizer)
      .sort({ createdAt: -1 })
      .lean();

    const stats = {
      total: events.length,
      draft: events.filter(
        event => event.status === "draft"
      ).length,
      published: events.filter(
        event => event.status === "published"
      ).length,
      cancelled: events.filter(
        event => event.status === "cancelled"
      ).length,
      completed: events.filter(
        event => event.status === "completed"
      ).length
    };

    return res.status(200).json({
      success: true,
      total: events.length,
      stats,
      events
    });
  } catch (error) {
    console.error("Get all events error:", error);

    return sendError(
      res,
      500,
      "Unable to load event management."
    );
  }
};

export const getManagedEventById = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    await event.populate(
      "organizer",
      populatedOrganizer
    );

    return res.status(200).json({
      success: true,
      event
    });
  } catch (error) {
    console.error("Get managed event error:", error);

    return sendError(
      res,
      500,
      "Unable to load event details."
    );
  }
};

export const updateEvent = async (req, res) => {
  let uploadedImage = "";

  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (
      ["cancelled", "completed"].includes(event.status)
    ) {
      return sendError(
        res,
        409,
        "Cancelled or completed events cannot be edited."
      );
    }

    const updates = buildEventData(req.body || {});

    const removeImage =
      req.body?.removeImage === "true" ||
      req.body?.removeImage === true;

    if (
      !Object.keys(updates).length &&
      !req.file &&
      !removeImage
    ) {
      return sendError(
        res,
        400,
        "No event fields provided."
      );
    }

    const mergedData = {
      ...event.toObject(),
      ...updates
    };

    const validationError = validateEventInput(
      mergedData,
      false
    );

    if (validationError) {
      return sendError(res, 400, validationError);
    }

    if (
      Number(mergedData.capacity) <
      event.registeredCount
    ) {
      return sendError(
        res,
        400,
        "Capacity cannot be lower than the number of registered attendees."
      );
    }

    const previousImage = event.image || "";

    if (req.file) {
      uploadedImage = await uploadEventImage(req.file);
      updates.image = uploadedImage;
    } else if (removeImage) {
      updates.image = "";
    }

    Object.assign(event, updates);

    await event.save();

    if (
      previousImage &&
      previousImage !== event.image
    ) {
      await deleteEventImage(previousImage);
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully.",
      event
    });
  } catch (error) {
    console.error("Update event error:", error);

    if (uploadedImage) {
      await deleteEventImage(uploadedImage);
    }

    if (error.name === "ValidationError") {
      return sendError(res, 400, error.message);
    }

    if (error.status === 400) {
      return sendError(res, 400, error.message);
    }

    return sendError(
      res,
      500,
      "Unable to update event."
    );
  }
};

export const publishEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (event.status !== "draft") {
      return sendError(
        res,
        409,
        "Only draft events can be published."
      );
    }

    const validationError = validateEventInput(
      event.toObject()
    );

    if (validationError) {
      return sendError(res, 400, validationError);
    }

    event.status = "published";
    event.publishedAt = new Date();

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event published successfully.",
      event
    });
  } catch (error) {
    console.error("Publish event error:", error);

    return sendError(
      res,
      500,
      "Unable to publish event."
    );
  }
};

export const unpublishEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (event.status !== "published") {
      return sendError(
        res,
        409,
        "Only published events can be unpublished."
      );
    }

    if (event.registeredCount > 0) {
      return sendError(
        res,
        409,
        "Events with registered attendees cannot be unpublished."
      );
    }

    event.status = "draft";
    event.publishedAt = null;

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event moved back to draft.",
      event
    });
  } catch (error) {
    console.error("Unpublish event error:", error);

    return sendError(
      res,
      500,
      "Unable to unpublish event."
    );
  }
};

export const cancelEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (
      reason.length < 10 ||
      reason.length > 1000
    ) {
      return sendError(
        res,
        400,
        "Cancellation reason must contain 10 to 1000 characters."
      );
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (
      !["draft", "published"].includes(event.status)
    ) {
      return sendError(
        res,
        409,
        "This event cannot be cancelled."
      );
    }

    event.status = "cancelled";
    event.cancelledAt = new Date();
    event.cancellationReason = reason;

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully.",
      event
    });
  } catch (error) {
    console.error("Cancel event error:", error);

    return sendError(
      res,
      500,
      "Unable to cancel event."
    );
  }
};

export const completeEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (event.status !== "published") {
      return sendError(
        res,
        409,
        "Only published events can be completed."
      );
    }

    if (new Date(event.endDate) > new Date()) {
      return sendError(
        res,
        409,
        "The event cannot be completed before its end date."
      );
    }

    event.status = "completed";

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event completed successfully.",
      event
    });
  } catch (error) {
    console.error("Complete event error:", error);

    return sendError(
      res,
      500,
      "Unable to complete event."
    );
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const event = await getEventForManagement(
      eventId,
      req.user
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found or access denied."
      );
    }

    if (event.registeredCount > 0) {
      return sendError(
        res,
        409,
        "Events with registered attendees cannot be moved to Trash."
      );
    }

    event.isDeleted = true;
    event.deletedAt = new Date();
    event.deletedBy = req.user._id;

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event moved to Trash successfully."
    });
  } catch (error) {
    console.error("Delete event error:", error);

    return sendError(
      res,
      500,
      "Unable to move event to Trash."
    );
  }
};

export const getTrashedEvents = async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const filter = {
      isDeleted: true
    };

    if (!isAdmin(req.user)) {
      filter.organizer = req.user._id;
    }

    const events = await Event.find(filter)
      .populate("organizer", populatedOrganizer)
      .populate(
        "deletedBy",
        "username fullName email"
      )
      .sort({ deletedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: events.length,
      events
    });
  } catch (error) {
    console.error("Get trashed events error:", error);

    return sendError(
      res,
      500,
      "Unable to load trashed events."
    );
  }
};

export const restoreEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!canManageEvents(req.user)) {
      return sendError(res, 403, "Access denied.");
    }

    const filter = {
      _id: eventId,
      isDeleted: true
    };

    if (!isAdmin(req.user)) {
      filter.organizer = req.user._id;
    }

    const event = await Event.findOneAndUpdate(
      filter,
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    );

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found in Trash."
      );
    }

    return res.status(200).json({
      success: true,
      message: "Event restored successfully.",
      event
    });
  } catch (error) {
    console.error("Restore event error:", error);

    return sendError(
      res,
      500,
      "Unable to restore event."
    );
  }
};

export const permanentlyDeleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!validId(eventId)) {
      return sendError(res, 400, "Invalid event ID.");
    }

    if (!isAdmin(req.user)) {
      return sendError(
        res,
        403,
        "Administrator access required."
      );
    }

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (
      reason.length < 10 ||
      reason.length > 1000
    ) {
      return sendError(
        res,
        400,
        "Permanent deletion reason must contain 10 to 1000 characters."
      );
    }

    const event = await Event.findOne({
      _id: eventId,
      isDeleted: true
    });

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found in Trash."
      );
    }

    if (event.registeredCount > 0) {
      return sendError(
        res,
        409,
        "Events with registered attendees cannot be permanently deleted."
      );
    }

    const deleted = await Event.deleteOne({
      _id: eventId,
      isDeleted: true,
      registeredCount: 0
    });

    if (deleted.deletedCount !== 1) {
      return sendError(
        res,
        409,
        "Event changed during deletion. Please refresh."
      );
    }

    if (event.image) {
      await deleteEventImage(event.image);
    }

    console.log("[ADMIN PERMANENT EVENT DELETE]", {
      eventId,
      deletedBy: String(req.user._id),
      reason
    });

    return res.status(200).json({
      success: true,
      message: "Event permanently deleted."
    });
  } catch (error) {
    console.error(
      "Permanent event deletion error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to permanently delete event."
    );
  }
};
