import { Badge } from "./badge";
import { Button } from "./button";
import { FilterType } from "@/lib/data";
import { Filter } from "lucide-react";

const StatsAndFilters = ({
  totalTasksCount = 0,
  completedTasksCount = 0,
  activeTasksCount = 0,
  filter = "all",
  setFilter = () => {},
}) => {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex gap-3">
        <Badge variant="secondary" className="border-primary/20 bg-white/50">
          {totalTasksCount} {FilterType.all}
        </Badge>
        <Badge
          variant="secondary"
          className="border-info/20 bg-white/50 text-accent-foreground"
        >
          {activeTasksCount} {FilterType.pending}
        </Badge>
        <Badge
          variant="secondary"
          className="border-success/20 bg-white/50 text-success"
        >
          {completedTasksCount} {FilterType.completed}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {Object.keys(FilterType).map((type) => (
          <Button
            key={type}
            variant={filter === type ? "gradient" : "ghost"}
            size="sm"
            className="capitalize"
            onClick={() => setFilter(type)}
          >
            <Filter className="size-4" />
            {FilterType[type]}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default StatsAndFilters;
