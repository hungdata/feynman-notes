import { useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  SquarePen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

const TaskCard = ({ task, index, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [isSaving, setIsSaving] = useState(false);

  const toggleCompleted = async () => {
    try {
      setIsSaving(true);
      await onUpdate(task._id, {
        status: task.status === "completed" ? "active" : "completed",
      });
    } catch (error) {
      console.error("Error updating task:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveTitle = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || trimmedTitle === task.title) {
      setIsEditing(false);
      setTitle(task.title);
      return;
    }

    try {
      setIsSaving(true);
      await onUpdate(task._id, { title: trimmedTitle });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating task:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const removeTask = async () => {
    try {
      setIsSaving(true);
      await onDelete(task._id);
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      className={cn(
        "group animate-fade-in border-0 bg-gradient-card p-4 shadow-custom-md transition-all duration-200 hover:shadow-custom-lg",
        task.status === "completed" && "opacity-75"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isSaving}
          onClick={toggleCompleted}
          className={cn(
            "size-8 shrink-0 rounded-full",
            task.status === "completed"
              ? "text-success hover:text-success/80"
              : "text-muted-foreground hover:text-primary"
          )}
        >
          {task.status === "completed" ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <Circle className="size-5" />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <form onSubmit={(event) => { event.preventDefault(); void saveTitle(); }}>
              <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => void saveTitle()}
                disabled={isSaving}
                className="h-10"
              />
            </form>
          ) : (
            <p
              className={cn(
                "text-base transition-all duration-200",
                task.status === "completed"
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            >
              {task.title}
            </p>
          )}

          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            <span>{new Date(task.createdAt).toLocaleString()}</span>
            {task.completedAt && <span>• Completed {new Date(task.completedAt).toLocaleString()}</span>}
          </div>
        </div>

        <div className="hidden gap-2 group-hover:inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSaving}
            onClick={() => setIsEditing((value) => !value)}
            className="size-8 text-muted-foreground hover:text-info"
          >
            {isEditing ? <Check className="size-4" /> : <SquarePen className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSaving}
            onClick={removeTask}
            className="size-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default TaskCard;
