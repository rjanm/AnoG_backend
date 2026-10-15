
import mongoose from "mongoose";
import User from "../models/User.js";
import OrganizerApplication from "../models/OrganizerApplication.js";
import { sendAccountDeletionEmail } from "../utils/accountDeletionEmail.js";

const userFields =
  "username fullName email phoneNumber profilePicture role accountStatus emailVerified organizerApplicationStatus organizerAppliedAt organizerReviewedAt createdAt updatedAt";

const activeUsers = {
  isDeleted: { $ne: true }
};

const validId = id => mongoose.isValidObjectId(id);

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message
  });

export const getAdminDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      totalAttendees,
      totalOrganizers,
      totalAdmins,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      recentApplications
    ] = await Promise.all([
      User.countDocuments(activeUsers),
      User.countDocuments({
        ...activeUsers,
        role: "attendee"
      }),
      User.countDocuments({
        ...activeUsers,
        role: "organizer"
      }),
      User.countDocuments({
        ...activeUsers,
        role: "admin"
      }),
      OrganizerApplication.countDocuments({
        status: "pending"
      }),
      OrganizerApplication.countDocuments({
        status: "approved"
      }),
      OrganizerApplication.countDocuments({
        status: "rejected"
      }),
      OrganizerApplication.find({
        status: "pending"
      })
        .populate(
          "applicant",
          "username fullName email accountStatus isDeleted"
        )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    const formattedRecentApplications =
      recentApplications.map(application => ({
        _id: application._id,
        applicationId: application._id,
        applicantId: application.applicant?._id || null,
        username:
          application.applicant?.username || "Unknown",
        fullName:
          application.applicant?.fullName || "",
        email:
          application.applicant?.email || "",
        accountStatus:
          application.applicant?.accountStatus || "",
        organizationName: application.organizationName,
        organizationType: application.organizationType,
        organizerApplicationStatus: application.status,
        organizerAppliedAt: application.createdAt,
        createdAt: application.createdAt
      }));

    return res.status(200).json({
      success: true,
      dashboard: {
        totalUsers,
        totalAttendees,
        totalOrganizers,
        totalAdmins,
        pendingApplications,
        approvedApplications,
        rejectedApplications,
        totalEvents: null
      },
      recentApplications: formattedRecentApplications
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return sendError(
      res,
      500,
      "Unable to load admin dashboard."
    );
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const users = await User.find(activeUsers)
      .select(userFields)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: users.length,
      users
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return sendError(
      res,
      500,
      "Unable to load users."
    );
  }
};

export const getAdminUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return sendError(
        res,
        400,
        "Invalid user ID."
      );
    }

    const user = await User.findOne({
      _id: userId,
      ...activeUsers
    })
      .select(userFields)
      .lean();

    if (!user) {
      return sendError(
        res,
        404,
        "User account not found."
      );
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error("Get admin user error:", error);
    return sendError(
      res,
      500,
      "Unable to load user details."
    );
  }
};

export const updateAdminUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { accountStatus } = req.body || {};

    if (!validId(userId)) {
      return sendError(
        res,
        400,
        "Invalid user ID."
      );
    }

    if (
      !["active", "suspended"].includes(accountStatus)
    ) {
      return sendError(
        res,
        400,
        "Account status must be active or suspended."
      );
    }

    if (
      String(req.user._id) === String(userId)
    ) {
      return sendError(
        res,
        403,
        "You cannot change your own account status."
      );
    }

    const user = await User.findOne({
      _id: userId,
      ...activeUsers
    }).select("_id role accountStatus");

    if (!user) {
      return sendError(
        res,
        404,
        "User account not found."
      );
    }

    if (user.role === "admin") {
      return sendError(
        res,
        403,
        "Administrator accounts cannot be modified here."
      );
    }

    if (user.accountStatus === accountStatus) {
      const existingUser = await User.findOne({
        _id: userId,
        ...activeUsers
      })
        .select(userFields)
        .lean();

      if (!existingUser) {
        return sendError(
          res,
          409,
          "Account changed during the request. Please refresh."
        );
      }

      return res.status(200).json({
        success: true,
        message: `Account is already ${accountStatus}.`,
        user: existingUser
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $ne: "admin" },
        ...activeUsers,
        accountStatus: user.accountStatus
      },
      {
        $set: { accountStatus }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    )
      .select(userFields)
      .lean();

    if (!updatedUser) {
      return sendError(
        res,
        409,
        "Account changed during the request. Please refresh."
      );
    }

    return res.status(200).json({
      success: true,
      message:
        accountStatus === "suspended"
          ? "User account suspended successfully."
          : "User account reactivated successfully.",
      user: updatedUser
    });
  } catch (error) {
    console.error(
      "Update user status error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to update account status."
    );
  }
};

export const deleteAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return sendError(
        res,
        400,
        "Invalid user ID."
      );
    }

    if (
      String(req.user._id) === String(userId)
    ) {
      return sendError(
        res,
        403,
        "You cannot move your own account to Trash."
      );
    }

    const deletionDate = new Date();

    const deletedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $ne: "admin" },
        ...activeUsers
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: deletionDate,
          deletedBy: req.user._id,
          deletionReason: "",
          deletionEmailStatus: "not_required",
          deletionEmailSentAt: null,
          accountStatus: "suspended"
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    ).select(
      "_id username fullName email role isDeleted deletedAt"
    );

    if (!deletedUser) {
      const existingUser = await User.findById(
        userId
      )
        .select("role isDeleted")
        .lean();

      if (
        !existingUser ||
        existingUser.isDeleted
      ) {
        return sendError(
          res,
          404,
          "User account not found or already in Trash."
        );
      }

      if (existingUser.role === "admin") {
        return sendError(
          res,
          403,
          "Administrator accounts cannot be moved to Trash."
        );
      }

      return sendError(
        res,
        409,
        "Account changed during the request. Please refresh."
      );
    }

    console.log(
      "[ADMIN SOFT DELETE]",
      {
        userId: String(deletedUser._id),
        deletedBy: String(req.user._id),
        deletedAt: deletionDate
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "User moved to Trash successfully. The account can be restored from Trash / Archive.",
      user: deletedUser
    });
  } catch (error) {
    console.error(
      "Delete admin user error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to move user to Trash."
    );
  }
};

export const getOrganizerApplications = async (
  req,
  res
) => {
  try {
    const status = String(
      req.query.status || "all"
    ).toLowerCase();

    if (
      ![
        "all",
        "pending",
        "approved",
        "rejected"
      ].includes(status)
    ) {
      return sendError(
        res,
        400,
        "Invalid application status."
      );
    }

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    const applications =
      await OrganizerApplication.find(filter)
        .populate(
          "applicant",
          "username fullName email role accountStatus isDeleted"
        )
        .populate(
          "reviewedBy",
          "username fullName"
        )
        .sort({ createdAt: -1 })
        .lean();

    const formattedApplications =
      applications.map(application => ({
        _id: application._id,
        applicationId: application._id,
        applicantId:
          application.applicant?._id || null,
        username:
          application.applicant?.username ||
          "Unknown",
        fullName:
          application.applicant?.fullName || "",
        email:
          application.applicant?.email || "",
        role:
          application.applicant?.role || "",
        accountStatus:
          application.applicant?.accountStatus ||
          "",
        organizationName:
          application.organizationName,
        organizationType:
          application.organizationType,
        reason:
          application.reason,
        experience:
          application.experience,
        organizerApplicationStatus:
          application.status,
        organizerAppliedAt:
          application.createdAt,
        organizerReviewedAt:
          application.reviewedAt,
        reviewNote:
          application.reviewNote,
        reviewedBy: application.reviewedBy
          ? {
              username:
                application.reviewedBy.username,
              fullName:
                application.reviewedBy.fullName
            }
          : null,
        createdAt:
          application.createdAt,
        updatedAt:
          application.updatedAt
      }));

    return res.status(200).json({
      success: true,
      total: formattedApplications.length,
      applications: formattedApplications
    });
  } catch (error) {
    console.error(
      "Get organizer applications error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to load organizer applications."
    );
  }
};

export const reviewOrganizerApplication = async (
  req,
  res
) => {
  let session;

  try {
    const { applicationId } = req.params;
    const {
      action,
      reviewNote = ""
    } = req.body || {};

    if (!validId(applicationId)) {
      return sendError(
        res,
        400,
        "Invalid application ID."
      );
    }

    if (
      !["approve", "reject"].includes(action)
    ) {
      return sendError(
        res,
        400,
        "Action must be approve or reject."
      );
    }

    if (
      typeof reviewNote !== "string" ||
      reviewNote.trim().length > 1000
    ) {
      return sendError(
        res,
        400,
        "Review note must not exceed 1000 characters."
      );
    }

    session = await mongoose.startSession();

    let updatedApplication;

    await session.withTransaction(async () => {
      const application =
        await OrganizerApplication.findById(
          applicationId
        ).session(session);

      if (!application) {
        const error = new Error(
          "Organizer application not found."
        );
        error.statusCode = 404;
        throw error;
      }

      if (application.status !== "pending") {
        const error = new Error(
          "Only pending applications can be reviewed."
        );
        error.statusCode = 409;
        throw error;
      }

      const user = await User.findById(
        application.applicant
      ).session(session);

      if (!user) {
        const error = new Error(
          "Applicant account not found."
        );
        error.statusCode = 404;
        throw error;
      }

      if (user.isDeleted === true) {
        const error = new Error(
          "Deleted accounts cannot be reviewed."
        );
        error.statusCode = 403;
        throw error;
      }

      if (user.role !== "attendee") {
        const error = new Error(
          "Only attendee accounts can be reviewed."
        );
        error.statusCode = 409;
        throw error;
      }

      if (user.accountStatus !== "active") {
        const error = new Error(
          "Suspended accounts cannot be reviewed."
        );
        error.statusCode = 403;
        throw error;
      }

      const newStatus =
        action === "approve"
          ? "approved"
          : "rejected";

      const reviewedAt = new Date();

      const applicationUpdate =
        await OrganizerApplication.updateOne(
          {
            _id: application._id,
            status: "pending"
          },
          {
            $set: {
              status: newStatus,
              reviewedBy: req.user._id,
              reviewedAt,
              reviewNote: reviewNote.trim()
            }
          },
          { session }
        );

      if (
        applicationUpdate.modifiedCount !== 1
      ) {
        const error = new Error(
          "This application has already been reviewed."
        );
        error.statusCode = 409;
        throw error;
      }

      const userUpdate = await User.updateOne(
        {
          _id: user._id,
          role: "attendee",
          accountStatus: "active",
          ...activeUsers
        },
        {
          $set: {
            role:
              action === "approve"
                ? "organizer"
                : "attendee",
            organizerApplicationStatus:
              newStatus,
            organizerAppliedAt:
              application.createdAt,
            organizerReviewedAt:
              reviewedAt
          }
        },
        { session }
      );

      if (
        userUpdate.matchedCount !== 1
      ) {
        const error = new Error(
          "Applicant account changed during review."
        );
        error.statusCode = 409;
        throw error;
      }

      updatedApplication = {
        _id: application._id,
        applicationId: application._id,
        applicantId: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        organizationName:
          application.organizationName,
        organizationType:
          application.organizationType,
        organizerApplicationStatus:
          newStatus,
        organizerAppliedAt:
          application.createdAt,
        organizerReviewedAt:
          reviewedAt,
        reviewNote:
          reviewNote.trim(),
        role:
          action === "approve"
            ? "organizer"
            : "attendee"
      };
    });

    return res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? "Organizer application approved successfully."
          : "Organizer application rejected successfully.",
      application: updatedApplication
    });
  } catch (error) {
    console.error(
      "Review organizer application error:",
      error.message
    );

    if (error.statusCode) {
      return sendError(
        res,
        error.statusCode,
        error.message
      );
    }

    if (
      error.code === 112 ||
      error.codeName === "WriteConflict"
    ) {
      return sendError(
        res,
        409,
        "Application was updated by another request. Please refresh."
      );
    }

    return sendError(
      res,
      500,
      "Unable to review organizer application."
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const getTrashedUsers = async (
  req,
  res
) => {
  try {
    const users = await User.find({
      isDeleted: true
    })
      .select(
        `${userFields} isDeleted deletedAt deletedBy deletionReason deletionEmailStatus deletionEmailSentAt`
      )
      .populate(
        "deletedBy",
        "username fullName email"
      )
      .sort({ deletedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      total: users.length,
      users
    });
  } catch (error) {
    console.error(
      "Get trashed users error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to load trashed users."
    );
  }
};

export const restoreTrashedUser = async (
  req,
  res
) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return sendError(
        res,
        400,
        "Invalid user ID."
      );
    }

    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        isDeleted: true,
        role: { $ne: "admin" }
      },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deletionReason: "",
          deletionEmailStatus: "not_required",
          deletionEmailSentAt: null,
          accountStatus: "active"
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    ).select(userFields);

    if (!user) {
      return sendError(
        res,
        404,
        "Deleted user not found or already restored."
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "User account restored successfully.",
      user
    });
  } catch (error) {
    console.error(
      "Restore trashed user error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to restore user."
    );
  }
};

export const permanentlyDeleteUser = async (
  req,
  res
) => {
  try {
    const { userId } = req.params;

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (!validId(userId)) {
      return sendError(
        res,
        400,
        "Invalid user ID."
      );
    }

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

    if (
      String(req.user._id) === String(userId)
    ) {
      return sendError(
        res,
        403,
        "You cannot permanently delete your own account."
      );
    }

    const user = await User.findOne({
      _id: userId,
      isDeleted: true,
      role: { $ne: "admin" }
    });

    if (!user) {
      return sendError(
        res,
        404,
        "User not found in Trash."
      );
    }

    const relatedApplications =
      await OrganizerApplication.countDocuments({
        applicant: user._id
      });

    if (relatedApplications > 0) {
      return sendError(
        res,
        409,
        "This user has organizer applications. Permanent deletion is blocked to preserve related records."
      );
    }

    // Before using permanent deletion in production,
    // also validate references from events,
    // registrations, tickets and payments.

    try {
      await sendAccountDeletionEmail({
        email: user.email,
        name:
          user.fullName ||
          user.username,
        reason,
        deletedAt: new Date()
      });
    } catch (emailError) {
      console.error(
        "Permanent deletion email error:",
        emailError
      );

      return res.status(502).json({
        success: false,
        code: "DELETION_EMAIL_FAILED",
        message:
          "Email notification failed. Account remains in Trash; fix the email configuration and retry."
      });
    }

    const deleted = await User.deleteOne({
      _id: userId,
      isDeleted: true,
      role: { $ne: "admin" }
    });

    if (deleted.deletedCount !== 1) {
      return sendError(
        res,
        409,
        "Email was submitted, but the account changed before permanent deletion. Please refresh."
      );
    }

    return res.status(200).json({
      success: true,
      emailSent: true,
      message:
        "Account permanently deleted. Email notification submitted."
    });
  } catch (error) {
    console.error(
      "Permanent deletion error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to permanently delete user."
    );
  }
};
