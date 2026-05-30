import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { syncUser } from "../middleware/syncUser.js";
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getCommunityProjects,
  generateVideoFromImage,
} from "../controllers/project.js";

const router = Router();

router.get("/community", getCommunityProjects);

router.use(protect, syncUser);

router.post("/", createProject);
router.get("/", getProjects);
router.get("/:id", getProject);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);
router.post("/:id/generate-video", generateVideoFromImage);

export default router;
