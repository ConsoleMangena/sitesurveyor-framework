import { useState } from "react";

import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  optional?: boolean;
  optionalLabel?: string;
  id?: string;
  onBlur?: () => void;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function ComboboxField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  emptyText = "No matches found.",
  optional = false,
  optionalLabel = "None",
  id,
  onBlur,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = query.trim()
    ? options.filter((option) =>
        option.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options;

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  const control = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          onBlur={onBlur}
          className="h-9 w-full justify-between px-3 font-normal aria-invalid:border-destructive aria-invalid:ring-destructive/20"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput
            placeholder="Search..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {optional && (
                <CommandItem value={optionalLabel} onSelect={() => select("")}>
                  <Check
                    className={cn(
                      "size-4",
                      value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {optionalLabel}
                </CommandItem>
              )}
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => select(option.value)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (!label) return control;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  );
}

export default ComboboxField;