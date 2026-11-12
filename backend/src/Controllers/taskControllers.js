import { getStore } from "../storage/index.js";

const TASK_STATUSES = new Set(["active", "completed"]);
const MAX_TITLE_LENGTH = 200;

const fail = (res, error, fallback) => {
  if (error?.status === 503) return res.status(503).json({ message: error.message, code: error.code });
  console.error(`${fallback}:`, error.message);
  const statusCode = error?.name === "CastError" ? 404 : 400;
  return res.status(statusCode).json({ message: fallback });
};

const readTitle = (value) => {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) return { error: "Title is required" };
  if (title.length > MAX_TITLE_LENGTH) return { error: `Title must be at most ${MAX_TITLE_LENGTH} characters` };
  return { title };
};

export const getAllTasks = async (req, res) => {
  try {
    res.status(200).json(await getStore().tasks.list(req.user.id));
  } catch (error) {
    if (error?.status === 503) return res.status(503).json({ message: error.message, code: error.code });
    console.error("Error fetching tasks:", error.message);
    res.status(500).json({ message: "Unable to fetch tasks" });
  }
};

export const createTask = async (req, res) => {
  try {
    const { title, error } = readTitle(req.body?.title);
    if (error) return res.status(400).json({ message: error });
    const task = await getStore().tasks.create(req.user.id, { title });
    res.status(201).json(task);
  } catch (error) {
    fail(res, error, "Unable to create task");
  }
};

export const updateTask = async (req, res) => {
  try {
    const { title, status, completedAt } = req.body || {};
    const updates = {};

    if (title !== undefined) {
      const result = readTitle(title);
      if (result.error) return res.status(400).json({ message: result.error });
      updates.title = result.title;
    }
    if (status !== undefined) {
      if (!TASK_STATUSES.has(status)) return res.status(400).json({ message: "Status must be active or completed" });
      updates.status = status;
      updates.completedAt = completedAt !== undefined ? completedAt : status === "completed" ? new Date() : null;
    } else if (completedAt !== undefined) {
      updates.completedAt = completedAt;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No changes provided" });
    if (!getStore().isValidId(req.params.id)) return res.status(404).json({ message: "Task not found" });

    const task = await getStore().tasks.update(req.user.id, req.params.id, updates);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json(task);
  } catch (error) {
    fail(res, error, "Unable to update task");
  }
};

export const deleteTask = async (req, res) => {
  try {
    if (!getStore().isValidId(req.params.id)) return res.status(404).json({ message: "Task not found" });
    const deletedTask = await getStore().tasks.remove(req.user.id, req.params.id);
    if (!deletedTask) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    fail(res, error, "Unable to delete task");
  }
};
