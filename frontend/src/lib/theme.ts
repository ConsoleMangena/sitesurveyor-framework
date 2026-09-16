export type ThemeMode = "light" | "dark"

export const THEME_STORAGE_KEY = "sitesurveyor-theme"

export function getStoredTheme(): ThemeMode | null {
  const value =
    typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_STORAGE_KEY)
  return value === "light" || value === "dark" ? value : null
}

export function getSystemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function resolveTheme(): ThemeMode {
  return getStoredTheme() ?? getSystemTheme()
}

/** Applies the theme to <html> (class + data attribute + theme-color meta). */
export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.setAttribute("data-theme", theme)
  root.style.colorScheme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#0d0f0e" : "#d92d20")
  }
}

/** Persists the choice and applies it immediately. */
export function setTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage may be unavailable (private mode etc.); still apply the theme.
  }
  applyTheme(theme)
}

/** Initializes the theme pre-render; safe to call multiple times. */
export function initTheme(): void {
  applyTheme(resolveTheme())
}