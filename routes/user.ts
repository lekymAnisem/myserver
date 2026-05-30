import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  getMe,
  getUserCredits,
  toggleProjectPublic,
} from "../controllers/userController.js";

const router = Router();

router.get("/me", protect, getMe);
router.get("/credits", protect, getUserCredits);
router.patch("/projects/:id/publish", protect, toggleProjectPublic);

export default router;
