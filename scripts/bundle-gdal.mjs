#!/usr/bin/env node
/**
 * Bundle a GDAL/PROJ runtime for redistribution with the SiteSurveyor desktop app.
 *
 * The resulting self-contained folder is bundled as a Tauri resource and loaded
 * at app start, so end users do not need a system GDAL install (e.g. OSGeo4W).
 *
 * Usage:
 *   GDAL_HOME="C:\OSGeo4W\apps\gdal-dev" node scripts/bundle-gdal.mjs
 *
 * Environment:
 *   GDAL_HOME        GDAL install prefix (with include/gdal.h and lib/) or an
 *                    OSGeo4W root. Windows example: C:\OSGeo4W\apps\gdal-dev
 *   BUNDLE_TARGET    Output directory (default: backend/bundled-gdal)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BACKEND_DIR = join(ROOT, "backend");
const DEFAULT_TARGET = join(BACKEND_DIR, "bundled-gdal");

const EXE_EXT = process.platform === "win32" ? ".exe" : "";
const DEFAULT_SDK_DIR = join(BACKEND_DIR, "gdal-sdk");

function log(...args) {
  console.log("[bundle-gdal]", ...args);
}

function fatal(...args) {
  console.error("[bundle-gdal]", ...args);
  process.exit(1);
}

function looksLikeGdalPrefix(path) {
  return existsSync(join(path, "include", "gdal.h"));
}

function resolveGdalHome(raw) {
  const candidate = resolve(raw);
  if (looksLikeGdalPrefix(candidate)) {
    return candidate;
  }
  const devSub = join(candidate, "apps", "gdal-dev");
  if (looksLikeGdalPrefix(devSub)) {
    return devSub;
  }
  fatal(
    `GDAL_HOME (${raw}) does not look like a GDAL prefix (missing include/gdal.h).` +
      " Set GDAL_HOME to the GDAL install root or the OSGeo4W apps/gdal-dev folder.",
  );
}

function resolveOsgeoRoot(prefix) {
  // If prefix is .../apps/gdal-dev, the OSGeo4W root is two levels up.
  const normalized = prefix.replace(/\\/g, "/");
  if (normalized.endsWith("/apps/gdal-dev")) {
    return resolve(prefix, "..", "..");
  }
  return prefix;
}

function gatherBinDirs(prefix, root) {
  const dirs = [];
  const prefixBin = join(prefix, "bin");
  if (existsSync(prefixBin)) {
    dirs.push(prefixBin);
  }
  const rootBin = join(root, "bin");
  if (existsSync(rootBin) && resolve(rootBin) !== resolve(prefixBin)) {
    dirs.push(rootBin);
  }
  return dirs;
}

function copyBinaries(sourceDirs, targetRoot) {
  const dllTarget = targetRoot;
  const exeTarget = join(targetRoot, "bin");
  mkdirSync(dllTarget, { recursive: true });
  mkdirSync(exeTarget, { recursive: true });

  const copiedDlls = [];
  const copiedExes = [];
  for (const dir of sourceDirs) {
    for (const entry of readdirSync(dir)) {
      const src = join(dir, entry);
      const stat = statSync(src);
      if (!stat.isFile()) continue;
      const lower = entry.toLowerCase();
      const isLib = lower.endsWith(".dll") || lower.endsWith(".so") || lower.endsWith(".dylib");
      const isExe = process.platform === "win32"
        ? lower.endsWith(".exe")
        : (stat.mode & 0o111) !== 0;
      if (!isLib && !isExe) continue;

      // Place shared libraries next to the application executable so Windows
      // resolves them at process startup. Utilities stay in a bin/ subfolder.
      const dst = isLib ? join(dllTarget, entry) : join(exeTarget, entry);
      if (existsSync(dst)) {
        log(`  skipping duplicate ${entry}`);
        continue;
      }
      copyFileSync(src, dst);
      (isLib ? copiedDlls : copiedExes).push(entry);
    }
  }
  log(`copied ${copiedDlls.length} shared libraries to ${dllTarget}`);
  log(`copied ${copiedExes.length} utilities to ${exeTarget}`);
}

function copyDataDirs(roots, targetShare) {
  mkdirSync(targetShare, { recursive: true });
  for (const root of roots) {
    for (const name of ["gdal", "proj"]) {
      const src = join(root, "share", name);
      if (!existsSync(src)) continue;
      const dst = join(targetShare, name);
      if (existsSync(dst)) continue;
      copyRecursive(src, dst);
      log(`copied data: ${src} -> ${dst}`);
    }
  }
}

function copyRecursive(src, dst) {
  const stat = statSync(src);
  if (stat.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dst, entry));
    }
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

function verifyBundle(target, prefix) {
  const bundledExe = join(target, "bin", `gdalinfo${EXE_EXT}`);
  let exe = bundledExe;
  let cwd = join(target, "bin");
  let libPath = target;

  if (!existsSync(exe)) {
    // Some minimal SDKs (e.g. the GISInternals runtime archive) do not ship
    // the command-line tools. Fall back to the source gdalinfo if available,
    // otherwise just skip version verification.
    const sourceExe = join(prefix, "bin", `gdalinfo${EXE_EXT}`);
    if (existsSync(sourceExe)) {
      log(`gdalinfo not bundled; verifying against source ${sourceExe}`);
      exe = sourceExe;
      cwd = dirname(exe);
      libPath = cwd;
    } else {
      log("warning: gdalinfo not found; skipping version verification");
      return "unknown";
    }
  }

  // The DLLs live in the bundle root (next to the main executable), but
  // gdalinfo.exe is in bin/. Make sure the loader can find the DLLs.
  const pathSep = process.platform === "win32" ? ";" : ":";
  const env = {
    ...process.env,
    PATH: `${libPath}${pathSep}${process.env.PATH || ""}`,
  };

  const result = spawnSync(exe, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 30000,
    cwd,
    env,
  });
  if (result.status !== 0 || !result.stdout) {
    fatal(
      `gdalinfo --version failed:\n${result.stderr || result.error || result.stdout || ""}`,
    );
  }
  const version = result.stdout.trim();
  log(`verified bundle: ${version}`);
  return version;
}

function writeManifest(target, prefix, root, version) {
  const manifest = {
    bundledAt: new Date().toISOString(),
    platform: process.platform,
    sourcePrefix: prefix,
    sourceRoot: root,
    gdalinfoVersion: version,
  };
  writeFileSync(join(target, "MANIFEST.json"), JSON.stringify(manifest, null, 2));
}

function main() {
  let gdalHome = process.env.GDAL_HOME;
  if (!gdalHome && looksLikeGdalPrefix(DEFAULT_SDK_DIR)) {
    gdalHome = DEFAULT_SDK_DIR;
  }
  if (!gdalHome) {
    fatal(
      "GDAL_HOME is not set and no downloaded SDK was found.\n\n" +
        "For local Windows development, install OSGeo4W and set GDAL_HOME:\n" +
        "  Windows (PowerShell): $env:GDAL_HOME = 'C:\\OSGeo4W\\apps\\gdal-dev'\n\n" +
        "For CI / release builds, download a Windows SDK first:\n" +
        "  node scripts/download-gdal.mjs",
    );
  }

  const prefix = resolveGdalHome(gdalHome);
  const root = resolveOsgeoRoot(prefix);
  const target = process.env.BUNDLE_TARGET ? resolve(process.env.BUNDLE_TARGET) : DEFAULT_TARGET;

  log(`source prefix: ${prefix}`);
  log(`source root:   ${root}`);
  log(`target:        ${target}`);

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  // Preserve the empty-directory marker so bundled-gdal is tracked even when
  // no runtime has been collected yet (e.g. on macOS/Linux builds).
  writeFileSync(
    join(target, ".gitkeep"),
    "# This directory is auto-populated by `scripts/bundle-gdal.mjs` before a release build.\n" +
      "# It must exist so that Tauri's resource bundling config resolves during development,\n" +
      "# but its contents are gitignored and should not be committed.\n",
  );

  const binDirs = gatherBinDirs(prefix, root);
  if (binDirs.length === 0) {
    fatal("No GDAL bin directories found.");
  }
  copyBinaries(binDirs, target);
  copyDataDirs([prefix, root], join(target, "share"));

  const version = verifyBundle(target, prefix);
  writeManifest(target, prefix, root, version);

  log(`bundle ready at ${target}`);
}

main();
