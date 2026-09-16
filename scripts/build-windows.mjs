#!/usr/bin/env node
/**
 * Build the SiteSurveyor Windows desktop installer with a GDAL SDK.
 *
 * For local development, install OSGeo4W (or set GDAL_HOME manually).
 * For CI / release builds, the GitHub Actions workflow is responsible for
 * downloading a self-contained GDAL SDK and exporting GDAL_HOME before this
 * script runs.
 *
 * Run from PowerShell:
 *   npm run tauri:build:win
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BACKEND = join(ROOT, "backend");

function log(...args) {
  console.log("[build-windows]", ...args);
}

function fatal(...args) {
  console.error("[build-windows]", ...args);
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
    log(`using GDAL_HOME from environment: ${process.env.GDAL_HOME}`);
    return process.env.GDAL_HOME;
  }

  const osgeo = findOsgeo4wRoot();
  if (osgeo) {
    log(`using OSGeo4W GDAL: ${osgeo}`);
    return osgeo;
  }

  fatal(
    "No usable GDAL install found.\n\n" +
      "For local development, install OSGeo4W and set GDAL_HOME, e.g.:\n" +
      "  $env:GDAL_HOME = 'C:\\OSGeo4W\\apps\\gdal-dev'\n\n" +
      "For CI / release builds, run scripts/download-gdal.mjs first and export GDAL_HOME."
  );
}

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("close", (code) => resolve(code ?? 0));
  });
}

async function main() {
  if (process.platform !== "win32") {
    fatal("This script is for Windows desktop builds only.");
  }

  const gdalHome = findGdalHome();
  const buildEnv = { ...process.env, GDAL_HOME: gdalHome };

  // Bundle the GDAL/PROJ runtime so the installer ships it.
  const bundleCode = await run(process.execPath, [join(ROOT, "scripts", "bundle-gdal.mjs")], {
    cwd: BACKEND,
    env: buildEnv,
  });
  if (bundleCode !== 0) {
    fatal("Failed to bundle GDAL runtime.");
  }

  // Build the Tauri desktop installer with GDAL support.
  // GDAL_HOME must be visible to cargo/gdal-sys during the Rust build.
  const extraArgs = process.argv.slice(2);
  const tauriCli = join(ROOT, "frontend", "node_modules", "@tauri-apps", "cli", "tauri.js");
  const buildCode = await run(
    process.execPath,
    [tauriCli, "build", "--features", "gdal", ...extraArgs],
    {
      cwd: BACKEND,
      env: buildEnv,
    },
  );

  process.exit(buildCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
