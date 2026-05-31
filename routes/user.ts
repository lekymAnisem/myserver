import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  getMe,
  getUserCredits,
  syncPlan,
  toggleProjectPublic,
} from "../controllers/userController.js";

const router = Router();

router.get("/me", protect, getMe);
router.get("/credits", protect, getUserCredits);
router.post("/me/sync-plan", protect, syncPlan);
router.patch("/projects/:id/publish", protect, toggleProjectPublic);

export default router;
