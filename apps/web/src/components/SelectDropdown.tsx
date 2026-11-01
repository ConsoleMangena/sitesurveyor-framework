import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectDropdownProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: SelectDropdownProps) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-full bg-background", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
