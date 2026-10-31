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
      className="h-8 w-full justify-start gap-2 text-muted-foreground sm:w-64"
      title="Search (Ctrl + K)"
    >
      <SearchIcon className="size-4" aria-hidden="true" />
      <span className="truncate">Search…</span>
      <kbd className="pointer-events-none ms-auto hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        Ctrl K
      </kbd>
    </Button>
  );
}
