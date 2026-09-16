/**
 * Client platform detection.
 *
 * Used to gate features that are only available in specific runtime shells.
 * The CAD workspace, for example, is intentionally limited to the Windows
 * desktop build (Tauri) while the rest of the workspace remains accessible on
 * every platform.
 */

type ClientPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

export function getClientPlatform(): ClientPlatform {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

/** True when running inside the Tauri desktop shell. */
export function isTauriShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return '__TAURI_INTERNALS__' in w || '__TAURI__' in w || w.isTauri === true;
}

export function isWindows(): boolean {
  return getClientPlatform() === 'windows';
}

/**
 * Whether the Engineering Surveyor CAD workspace should be exposed in this
 * runtime. In production it is only enabled for the Windows Tauri build. In
 * development it is enabled everywhere so the CAD UI can be tested without
 * building the desktop shell every time.
 */
export function isCadPlatformSupported(): boolean {
  if (import.meta.env.VITE_DISABLE_CAD === 'true') return false;
  if (import.meta.env.VITE_MOBILE_BUILD === 'true') return false;
  if (import.meta.env.DEV) return true;
  return isTauriShell() && isWindows();
}
