
import express from "express";

import {
  protect
} from "../middleware/authMiddleware.js";

import {
  submitOrganizerApplication,
  getMyOrganizerApplication
} from "../controllers/organizerController.js";

const organizerRouter = express.Router();

organizerRouter.use(protect);

organizerRouter.post(
  "/apply",
  submitOrganizerApplication
);

organizerRouter.get(
  "/my-application",
  getMyOrganizerApplication
);

export default organizerRouter;
