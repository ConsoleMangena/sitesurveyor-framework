/**
 * CAD file import bridge — DXF only, via Tauri GDAL backend.
 *
 * DXF import is intentionally desktop-only. GDAL's OGR DXF driver is far more
 * reliable than the JavaScript alternatives, and DWG support is not provided
 * by standard GDAL builds. Run the app with `npm run tauri dev` (and GDAL
 * installed) to use this importer.
 */

import type { DxfImportResult } from "../io/dxf.ts";

export type CadBackend = "gdal" | null;

interface TauriCore {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriCore: TauriCore | null | undefined;
let gdalAvailable: boolean | undefined;

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w || w.isTauri === true;
}

async function getTauri(): Promise<TauriCore | null> {
  if (tauriCore !== undefined) return tauriCore;
  if (!isTauri()) {
    tauriCore = null;
    return tauriCore;
  }
  try {
    const mod = (await import("@tauri-apps/api/core")) as unknown as TauriCore;
    tauriCore = typeof mod.invoke === "function" ? mod : null;
  } catch {
    tauriCore = null;
  }
  return tauriCore;
}

async function isGdalAvailable(): Promise<boolean> {
  if (gdalAvailable !== undefined) return gdalAvailable;
  const t = await getTauri();
  if (!t) {
    gdalAvailable = false;
    return gdalAvailable;
  }
  try {
    gdalAvailable = await t.invoke<boolean>("gdal_available");
  } catch (_err) {
    // If the command itself is missing, the backend was built without --features gdal.
    gdalAvailable = false;
  }
  return gdalAvailable;
}

let activeBackend: CadBackend = null;

export function lastCadBackend(): CadBackend {
  return activeBackend;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Parse a DXF file through GDAL. This only works inside the SiteSurveyor
 * desktop app with GDAL installed.
 */
export async function parseCadFile(file: File, fileName?: string): Promise<DxfImportResult> {
  const name = fileName ?? file.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext !== "dxf") {
    throw new Error(
      `Only DXF files are supported for import. Convert DWG to DXF first, or use a GDAL build that includes a DWG driver.`,
    );
  }

  const t = await getTauri();
  if (!t) {
    throw new Error(
      `DXF import requires the SiteSurveyor desktop app. It is not available in the browser development build. Run "npm run tauri dev" with GDAL installed.`,
    );
  }

  if (!(await isGdalAvailable())) {
    throw new Error(
      `DXF import is unavailable because the running desktop build was compiled without the GDAL cargo feature.\n\n` +
        `Rebuild the backend with GDAL support and relaunch the desktop app:\n` +
        `  cd backend\n` +
        `  $env:GDAL_HOME = 'C:\\path\\to\\gdal'    # or export GDAL_HOME=/path/to/gdal\n` +
        `  npm run cargo:build:gdal\n` +
        `  cd ../frontend\n` +
        `  npm run tauri dev\n\n` +
        `If the window was already open when the fix was applied, its binary is stale. Kill it and rebuild.`,
    );
  }

  const bytes = await fileToBytes(file);
  const result = await t.invoke<DxfImportResult>("parse_cad_file_gdal", {
    bytes: Array.from(bytes),
    fileName: name,
  });
  activeBackend = "gdal";
  return result;
}
