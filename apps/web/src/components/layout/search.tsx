import { Search as SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSearch } from "@/context/search-provider";

export function Search() {
  const { setOpen } = useSearch();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className="h-8 w-8 p-0 sm:w-56 md:w-64 sm:px-3 justify-center sm:justify-start gap-2 text-muted-foreground shrink-0 sm:shrink"
      title="Search (Ctrl + K)"
      aria-label="Search"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline truncate">Search…</span>
      <kbd className="pointer-events-none ms-auto hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        Ctrl K
      </kbd>
    </Button>
  );
}
