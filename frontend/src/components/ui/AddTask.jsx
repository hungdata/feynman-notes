import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "./button";
import { Card } from "./card";
import { Input } from "./input";

const AddTask = ({ onAdd }) => {
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAdd(trimmedTitle);
      setTitle("");
    } catch (error) {
      console.error("Error adding task:", error);
      toast.error(error.message || "Không thể thêm nhiệm vụ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-0 bg-gradient-card p-6 shadow-custom-lg">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <Input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Cần phải làm gì?"
          className="h-12 bg-slate-50 text-base sm:flex-1"
        />
        <Button
          type="submit"
          variant="gradient"
          className="h-12"
          disabled={isSubmitting || !title.trim()}
        >
          <Plus className="mr-2 h-5 w-5" />
          {isSubmitting ? "Adding..." : "Add Task"}
        </Button>
      </form>
    </Card>
  );
};

export default AddTask;
