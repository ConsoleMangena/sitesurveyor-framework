import { createContext, useContext, useEffect, useState } from "react";

import { CommandMenu } from "@/components/command-menu";
import type { WorkspaceNavGroup, WorkspaceView } from "@/features/workspace/types";

type SearchContextType = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
};

const SearchContext = createContext<SearchContextType | null>(null);

type SearchProviderProps = {
  children: React.ReactNode;
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
};

export function SearchProvider({
  children,
  navGroups,
  activeView,
  onChangeView,
}: SearchProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      const isCommandK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      const isSlash = e.key === "/" && !isTyping;

      if (isCommandK || isSlash) {
        e.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <SearchContext.Provider
      value={{ open, setOpen, navGroups, activeView, onChangeView }}
    >
      {children}
      <CommandMenu />
    </SearchContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearch() {
  const searchContext = useContext(SearchContext);
  if (!searchContext) {
    throw new Error("useSearch has to be used within SearchProvider");
  }
  return searchContext;
}
