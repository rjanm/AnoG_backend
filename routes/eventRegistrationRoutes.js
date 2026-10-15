
import express from "express";

import {
  registerForEvent,
  getMyRegistrations,
  getRegistrationStatus
} from "../controllers/eventRegistrationController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/my", getMyRegistrations);

router.get(
  "/status/:eventId",
  getRegistrationStatus
);

router.post(
  "/:eventId",
  registerForEvent
);

export default router;
