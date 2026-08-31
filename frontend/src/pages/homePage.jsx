import AddTask from "@/components/ui/AddTask";
import DateTimeFilter from "@/components/ui/DateTimeFilter";
import Footer from "@/components/ui/Footer";
import { Header } from "@/components/Header";
import StatsAndFilters from "@/components/ui/StatsAndFilters";
import TaskListPagination from "@/components/ui/TaskListPagination";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

const API_URL = `${import.meta.env.VITE_API_URL || "/api"}/tasks`;

const HomePage = () => {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  useEffect(() => {
    const controller = new AbortController();

    const fetchTasks = async () => {
      try {
        const response = await fetch(API_URL, { signal: controller.signal });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to fetch tasks");
        }

        setTasks(data.tasks ?? []);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error fetching tasks:", error);
          toast.error("Không thể tải danh sách nhiệm vụ.");
        }
      }
    };

    void fetchTasks();

    return () => controller.abort();
  }, []);

  const taskStats = useMemo(
    () =>
      tasks.reduce(
        (stats, task) => {
          stats.total += 1;

          if (task.status === "completed") {
            stats.completed += 1;
          } else {
            stats.pending += 1;
          }

          return stats;
        },
        { total: 0, pending: 0, completed: 0 }
      ),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const fromDate = dateRange.from
      ? new Date(`${dateRange.from}T00:00:00`)
      : null;
    const toDate = dateRange.to
      ? new Date(`${dateRange.to}T23:59:59.999`)
      : null;

    return tasks.filter((task) => {
      const matchesStatus =
        filter === "all" ||
        (filter === "completed" && task.status === "completed") ||
        (filter === "pending" && task.status === "active");

      if (!matchesStatus) return false;

      const createdAt = new Date(task.createdAt);
      if (Number.isNaN(createdAt.getTime())) return !fromDate && !toDate;

      return (
        (!fromDate || createdAt >= fromDate) &&
        (!toDate || createdAt <= toDate)
      );
    });
  }, [dateRange, filter, tasks]);

  const addTask = async (title) => {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const task = await response.json();

    if (!response.ok) {
      throw new Error(task.message || "Unable to create task");
    }

    setTasks((currentTasks) => [task, ...currentTasks]);
    toast.success("Đã thêm nhiệm vụ.");
  };

  const updateTask = async (id, updates) => {
    const response = await fetch(`${API_URL}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const task = await response.json();

    if (!response.ok) {
      throw new Error(task.message || "Unable to update task");
    }

    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask._id === id ? task : currentTask
      )
    );
  };

  const deleteTask = async (id) => {
    const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to delete task");
    }

    setTasks((currentTasks) =>
      currentTasks.filter((task) => task._id !== id)
    );
    toast.success("Đã xóa nhiệm vụ.");
  };

  return (
    <div className="min-h-screen w-full bg-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <Header />
          <AddTask onAdd={addTask} />
          <StatsAndFilters
            totalTasksCount={taskStats.total}
            completedTasksCount={taskStats.completed}
            activeTasksCount={taskStats.pending}
            filter={filter}
            setFilter={setFilter}
          />
          <DateTimeFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
          <TaskListPagination
            key={`${filter}-${dateRange.from}-${dateRange.to}`}
            tasks={filteredTasks}
            filter={filter}
            onUpdate={updateTask}
            onDelete={deleteTask}
          />
          <Footer
            completedTasksCount={taskStats.completed}
            activeTasksCount={taskStats.pending}
          />
        </div>
      </div>
    </div>
  );
};

export default HomePage;
