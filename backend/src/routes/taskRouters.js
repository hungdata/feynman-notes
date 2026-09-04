import express from "express";

import {
  createTask,
  deleteTask,
  getAllTasks,
  updateTask,
} from "../Controllers/taskControllers.js";
import { requireAuth } from "../auth/requireAuth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", getAllTasks);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);
export default router;
