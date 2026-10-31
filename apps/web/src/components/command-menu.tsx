import * as React from "react";
import { ArrowRight, Moon, Sun } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getNavIcon } from "@/components/workspace/navIcons";
import { useSearch } from "@/context/search-provider";
import { useThemeMode } from "@/hooks/use-theme";

export function CommandMenu() {
  const { open, setOpen, navGroups, activeView, onChangeView } = useSearch();
  const { setTheme } = useThemeMode();

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false);
      command();
    },
    [setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and commands…" />
      <CommandList>
        <ScrollArea type="hover" className="h-80 pe-1">
          <CommandEmpty>No results found.</CommandEmpty>

          {navGroups.map((group, groupIndex) => (
            <CommandGroup
              key={`${group.label ?? "group"}-${groupIndex}`}
              heading={group.label}
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.view}
                  value={item.label}
                  onSelect={() =>
                    runCommand(() => onChangeView(item.view))
                  }
                >
                  <div className="flex size-4 items-center justify-center">
                    {getNavIcon(item.icon)}
                  </div>
                  <span>{item.label}</span>
                  {item.view === activeView ? (
                    <span className="ms-auto text-xs text-muted-foreground">
                      Current
                    </span>
                  ) : (
                    <ArrowRight className="ms-auto size-3 text-muted-foreground/60" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandSeparator />

          <CommandGroup heading="Theme">
            <CommandItem
              value="light theme"
              onSelect={() => runCommand(() => setTheme("light"))}
            >
              <Sun className="size-4" />
              <span>Light</span>
            </CommandItem>
            <CommandItem
              value="dark theme"
              onSelect={() => runCommand(() => setTheme("dark"))}
            >
              <Moon className="size-4" />
              <span>Dark</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  );
}
