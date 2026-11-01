import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DatePickerProps = {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: (date: Date) => boolean;
};

export function DatePicker({
  selected,
  onSelect,
  placeholder = "Pick a date",
  className,
  disabled,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!selected}
          className={cn(
            "w-60 justify-start text-start font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          {selected ? (
            format(selected, "MMM d, yyyy")
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarIcon className="ms-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          onSelect={onSelect}
          disabled={
            disabled ??
            ((date: Date) =>
              date > new Date() || date < new Date("1900-01-01"))
          }
        />
      </PopoverContent>
    </Popover>
  );
}

