import { useMemo, useState } from "react";
import TaskList from "./TaskList";
import { Button } from "./button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "./pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TASKS_PER_PAGE = 5;

const TaskListPagination = ({ tasks, filter, onUpdate, onDelete }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);

  const visibleTasks = useMemo(() => {
    const startIndex = (activePage - 1) * TASKS_PER_PAGE;
    return tasks.slice(startIndex, startIndex + TASKS_PER_PAGE);
  }, [activePage, tasks]);

  const pageNumbers = useMemo(() => {
    const firstPage = Math.max(1, Math.min(activePage - 1, totalPages - 2));
    const lastPage = Math.min(totalPages, firstPage + 2);
    return Array.from(
      { length: lastPage - firstPage + 1 },
      (_, index) => firstPage + index
    );
  }, [activePage, totalPages]);

  return (
    <div className="space-y-4">
      <TaskList
        tasks={visibleTasks}
        filter={filter}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {tasks.length > TASKS_PER_PAGE && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            Hiển thị {(activePage - 1) * TASKS_PER_PAGE + 1}–
            {Math.min(activePage * TASKS_PER_PAGE, tasks.length)} trong {tasks.length} nhiệm vụ
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={activePage === 1}
                  aria-label="Trang trước"
                  onClick={() => setCurrentPage(activePage - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              </PaginationItem>

              {pageNumbers.map((page) => (
                <PaginationItem key={page}>
                  <Button
                    type="button"
                    variant={activePage === page ? "gradient" : "ghost"}
                    size="icon"
                    aria-label={`Trang ${page}`}
                    aria-current={activePage === page ? "page" : undefined}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                </PaginationItem>
              ))}

              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={activePage === totalPages}
                  aria-label="Trang sau"
                  onClick={() => setCurrentPage(activePage + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};

export default TaskListPagination;
