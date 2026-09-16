#!/usr/bin/env node
/**
 * Start the Tauri dev app on Windows using a locally installed GDAL SDK.
 *
 * For local development, install OSGeo4W (or set GDAL_HOME manually).
 *
 * Run from PowerShell (not WSL):
 *   npm run tauri:dev:win
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function log(...args) {
  console.log("[dev-windows]", ...args);
}

function fatal(...args) {
  console.error("[dev-windows]", ...args);
  process.exit(1);
}

function hasGdalHeaders(prefix) {
  return (
    existsSync(join(prefix, "include", "gdal.h")) ||
    existsSync(join(prefix, "apps", "gdal-dev", "include", "gdal.h"))
  );
}

function findOsgeo4wRoot() {
  const env = process.env.OSGEO4W_ROOT;
  if (env) {
    const dev = join(env, "apps", "gdal-dev");
    if (hasGdalHeaders(dev)) return dev;
    if (hasGdalHeaders(env)) return env;
  }

  for (const drive of ["C:", "D:"]) {
    for (const name of ["OSGeo4W64", "OSGeo4W"]) {
      const candidate = join(drive, "\\", name);
      const dev = join(candidate, "apps", "gdal-dev");
      if (hasGdalHeaders(dev)) return dev;
      if (hasGdalHeaders(candidate)) return candidate;
    }
  }

  // OSGeo4W installed per-user (e.g. via winget or the web installer).
  if (process.env.LOCALAPPDATA) {
    const candidate = join(process.env.LOCALAPPDATA, "Programs", "OSGeo4W");
    const dev = join(candidate, "apps", "gdal-dev");
    if (hasGdalHeaders(dev)) return dev;
    if (hasGdalHeaders(candidate)) return candidate;
  }

  return null;
}

function findGdalHome() {
  if (process.env.GDAL_HOME && hasGdalHeaders(process.env.GDAL_HOME)) {
    return process.env.GDAL_HOME;
  }

  const osgeo = findOsgeo4wRoot();
  if (osgeo) return osgeo;

  return null;
}

async function main() {
  if (process.platform !== "win32") {
    fatal("This script is for Windows.");
  }

  let gdalHome = findGdalHome();

  if (!gdalHome) {
    fatal(
      "No usable GDAL install found.\n\n" +
        "For local development, install OSGeo4W and set GDAL_HOME, e.g.:\n" +
        "  $env:GDAL_HOME = 'C:\\OSGeo4W\\apps\\gdal-dev'\n\n" +
        "For CI / release builds, run scripts/download-gdal.mjs first and export GDAL_HOME."
    );
  }

  log("GDAL_HOME ->", gdalHome);

  // OSGeo4W splits GDAL and its dependencies between apps/gdal-dev/bin and the
  // OSGeo4W root/bin. Make sure both are on PATH so the running app can load
  // gdal.dll, proj.dll, sqlite3.dll, and the rest of the dependency tree.
  const binPaths = [join(gdalHome, "bin")];
  const normalized = gdalHome.replace(/\\/g, "/");
  if (normalized.endsWith("/apps/gdal-dev")) {
    binPaths.push(resolve(gdalHome, "..", "..", "bin"));
  }
  const env = {
    ...process.env,
    GDAL_HOME: gdalHome,
    PATH: `${binPaths.join(";")};${process.env.PATH || ""}`,
  };

  // Invoke the local Tauri CLI directly. Using `npm exec tauri` is fragile on
  // Windows because npm may resolve the unscoped `tauri` package from the
  // registry instead of the locally installed `@tauri-apps/cli` binary.
  const tauriCli = join(ROOT, "frontend", "node_modules", "@tauri-apps", "cli", "tauri.js");
  const child = spawn(
    process.execPath,
    [tauriCli, "dev", "--features", "gdal"],
    {
      cwd: ROOT,
      env,
      stdio: "inherit",
    },
  );

  child.on("close", (code) => process.exit(code ?? 0));
}

main().catch(fatal);
