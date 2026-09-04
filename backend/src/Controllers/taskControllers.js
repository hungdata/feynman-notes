import Task from "../models/tasks.js";

export const getAllTasks = async (req, res) => {
  try {
    const [result] = await Task.aggregate([
      { $match: { ownerId: req.user.id } },
      {
        $facet: {
          tasks: [{ $sort: { createdAt: -1 } }],
          activeCount: [{ $match: { status: "active" } }, { $count: "count" }],
          completedCount: [
            { $match: { status: "completed" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    res.status(200).json({
      tasks: result.tasks,
      activeCount: result.activeCount[0]?.count ?? 0,
      completedCount: result.completedCount[0]?.count ?? 0,
    });
  } catch (error) {
    console.error("Error fetching tasks:", error.message);
    res.status(500).json({ message: "Unable to fetch tasks" });
  }
};

export const createTask = async (req, res) => {
  try {
    const title = req.body.title?.trim();

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const task = await Task.create({ title, ownerId: req.user.id });
    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error.message);
    res.status(400).json({ message: "Unable to create task" });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { title, status, completedAt } = req.body;
    const updates = {};

    if (title !== undefined) {
      const trimmedTitle = typeof title === "string" ? title.trim() : "";
      if (!trimmedTitle) {
        return res.status(400).json({ message: "Title is required" });
      }
      updates.title = trimmedTitle;
    }
    if (status !== undefined) {
      updates.status = status;
      updates.completedAt =
        completedAt !== undefined
          ? completedAt
          : status === "completed"
            ? new Date()
            : null;
    } else if (completedAt !== undefined) {
      updates.completedAt = completedAt;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No changes provided" });
    }

    const task = await Task.findOneAndUpdate({ _id: req.params.id, ownerId: req.user.id }, updates, {
      new: true,
      runValidators: true,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json(task);
  } catch (error) {
    console.error("Error updating task:", error.message);
    const statusCode = error.name === "CastError" ? 404 : 400;
    res.status(statusCode).json({ message: "Unable to update task" });
  }
};

export const deleteTask = async (req, res) => {
  try {
    const deletedTask = await Task.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });

    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error.message);
    const statusCode = error.name === "CastError" ? 404 : 400;
    res.status(statusCode).json({ message: "Unable to delete task" });
  }
};
