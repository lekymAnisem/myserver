import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { syncUser } from "../middleware/syncUser.js";
import {
  createImageGeneration,
  createVideoGeneration,
} from "../controllers/generation.js";

const router = Router();

router.use(protect, syncUser);

router.post("/image", createImageGeneration);
router.post("/video", createVideoGeneration);

export default router;
