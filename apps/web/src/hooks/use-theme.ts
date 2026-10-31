import { useCallback, useEffect, useState } from "react";

import {
  applyTheme,
  resolveTheme,
  setTheme as persistTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";

/**
 * Reads and writes the SiteSurveyor theme.
 *
 * Kept in sync across tabs via the `storage` event, and with the pre-render
 * bootstrap in `lib/theme.ts` (which owns the `<html>` class + meta tag).
 */
export function useThemeMode() {
  const [theme, setThemeState] = useState<ThemeMode>(resolveTheme);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setThemeState(resolveTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    persistTheme(next);
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
