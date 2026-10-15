
import mongoose from "mongoose";
import OrganizerApplication from "../models/OrganizerApplication.js";
import User from "../models/User.js";

const allowedOrganizationTypes = [
  "individual",
  "school",
  "business",
  "organization",
  "other"
];

const normalizeText = value =>
  typeof value === "string" ? value.trim() : "";

export const submitOrganizerApplication = async (req, res) => {
  try {
    const userId = req.user._id;

    const organizationName = normalizeText(
      req.body.organizationName
    );

    const organizationType = normalizeText(
      req.body.organizationType
    ).toLowerCase();

    const reason = normalizeText(req.body.reason);
    const experience = normalizeText(req.body.experience);

    if (req.user.role !== "attendee") {
      return res.status(403).json({
        success: false,
        message: "Only attendees can apply to become organizers."
      });
    }

    if (req.user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account must be active to apply."
      });
    }

    if (
      !allowedOrganizationTypes.includes(organizationType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid organization type."
      });
    }

    if (organizationName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Organization name must not exceed 150 characters."
      });
    }

    if (reason.length < 20 || reason.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Application reason must contain 20 to 2000 characters."
      });
    }

    if (experience.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Experience must not exceed 2000 characters."
      });
    }

    const existingPending = await OrganizerApplication.findOne({
      applicant: userId,
      status: "pending"
    });

    if (existingPending) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending organizer application."
      });
    }

    if (req.user.organizerApplicationStatus === "approved") {
      return res.status(409).json({
        success: false,
        message: "Your organizer application has already been approved."
      });
    }

    const application = await OrganizerApplication.create({
      applicant: userId,
      organizationName,
      organizationType,
      reason,
      experience,
      status: "pending"
    });

    await User.findByIdAndUpdate(userId, {
      $set: {
        organizerApplicationStatus: "pending",
        organizerAppliedAt: application.createdAt,
        organizerReviewedAt: null
      }
    });

    return res.status(201).json({
      success: true,
      message: "Organizer application submitted successfully.",
      application: {
        id: application._id,
        organizationName: application.organizationName,
        organizationType: application.organizationType,
        reason: application.reason,
        experience: application.experience,
        status: application.status,
        createdAt: application.createdAt
      }
    });
  } catch (error) {
    console.error(
      "Submit organizer application error:",
      error.message
    );

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending organizer application."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to submit organizer application."
    });
  }
};

export const getMyOrganizerApplication = async (req, res) => {
  try {
    const application = await OrganizerApplication.findOne({
      applicant: req.user._id
    })
      .sort({ createdAt: -1 })
      .select(
        "organizationName organizationType reason experience status reviewedAt reviewNote createdAt updatedAt"
      )
      .lean();

    return res.status(200).json({
      success: true,
      application: application || null,
      userRole: req.user.role,
      applicationStatus:
        application?.status ||
        req.user.organizerApplicationStatus ||
        "none"
    });
  } catch (error) {
    console.error(
      "Get organizer application error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load your organizer application."
    });
  }
};
