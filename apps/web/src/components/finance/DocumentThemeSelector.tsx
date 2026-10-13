import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentTheme } from "@/lib/printDocument.ts";

interface DocumentThemeSelectorProps {
  value: DocumentTheme;
  onChange: (value: DocumentTheme) => void;
  className?: string;
}

export function DocumentThemeSelector({
  value,
  onChange,
  className,
}: DocumentThemeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DocumentTheme)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Document theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="modern">Modern</SelectItem>
        <SelectItem value="classic">Classic</SelectItem>
        <SelectItem value="minimal">Minimal</SelectItem>
      </SelectContent>
    </Select>
  );
}
