
import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

const DateTimeFilter = ({ dateRange, onDateRangeChange }) => {
  const hasDateFilter = dateRange.from || dateRange.to;

  const updateDate = (field, value) => {
    onDateRangeChange((currentRange) => ({
      ...currentRange,
      [field]: value,
    }));
  };

  return (
    <div className="rounded-lg border bg-white/60 p-4 shadow-custom-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <CalendarDays className="size-4 text-primary" />
        Lọc theo ngày tạo
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
          Từ ngày
          <Input
            type="date"
            value={dateRange.from}
            max={dateRange.to || undefined}
            onChange={(event) => updateDate("from", event.target.value)}
            className="bg-white text-sm text-foreground"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
          Đến ngày
          <Input
            type="date"
            value={dateRange.to}
            min={dateRange.from || undefined}
            onChange={(event) => updateDate("to", event.target.value)}
            className="bg-white text-sm text-foreground"
          />
        </label>

        {hasDateFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDateRangeChange({ from: "", to: "" })}
            className="shrink-0"
          >
            <RotateCcw className="size-4" />
            Xóa lọc
          </Button>
        )}
      </div>
    </div>
  );
};

export default DateTimeFilter;
