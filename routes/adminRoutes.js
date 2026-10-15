
import express from "express";

import {
  protect,
  adminOnly
} from "../middleware/authMiddleware.js";

import {
  getAdminDashboard,
  getAdminUsers,
  getAdminUserById,
  updateAdminUserStatus,
  deleteAdminUser,
  getTrashedUsers,
  restoreTrashedUser,
  permanentlyDeleteUser,
  getOrganizerApplications,
  reviewOrganizerApplication
} from "../controllers/adminController.js";

const adminRouter = express.Router();

adminRouter.use(protect);
adminRouter.use(adminOnly);

adminRouter.get(
  "/dashboard",
  getAdminDashboard
);

adminRouter.get(
  "/users",
  getAdminUsers
);

adminRouter.get(
  "/users/:userId",
  getAdminUserById
);

adminRouter.patch(
  "/users/:userId/status",
  updateAdminUserStatus
);

adminRouter.delete(
  "/users/:userId",
  deleteAdminUser
);

adminRouter.get(
  "/trash/users",
  getTrashedUsers
);

adminRouter.patch(
  "/trash/users/:userId/restore",
  restoreTrashedUser
);

adminRouter.delete(
  "/trash/users/:userId/permanent",
  permanentlyDeleteUser
);

adminRouter.get(
  "/applications",
  getOrganizerApplications
);

adminRouter.patch(
  "/applications/:applicationId/review",
  reviewOrganizerApplication
);

export default adminRouter;
