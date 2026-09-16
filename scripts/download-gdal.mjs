#!/usr/bin/env node
/**
 * Download a self-contained Windows GDAL SDK from GISInternals for CI.
 *
 * This script is intended for GitHub Actions release builds. It should not be
 * necessary for local development, which is expected to use an OSGeo4W install
 * (or GDAL_HOME set manually).
 *
 * The downloaded SDK can be used both for linking
 * (`GDAL_HOME=backend/gdal-sdk`) and as the source for `npm run bundle:gdal`.
 *
 * Usage:
 *   node scripts/download-gdal.mjs
 *   node scripts/download-gdal.mjs --if-missing   # skip if already present
 *   node scripts/download-gdal.mjs --force         # re-download
 *
 * The SDK is cached in backend/gdal-sdk/ (gitignored). On non-Windows platforms
 * this script prints manual install instructions instead.
 */

import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SDK_DIR = join(ROOT, "backend", "gdal-sdk");

// GISInternals MSVC 2022 (1930) build for GDAL 3.9.0. The runtime package
// contains GDAL/PROJ DLLs and utilities; the dev package contains headers
// and import libraries needed to compile the Rust gdal crate.
const URLS = {
  runtime:
    "https://download.gisinternals.com/sdk/downloads/release-1930-x64-gdal-3-9-0-mapserver-8-0-1.zip",
  libs: "https://download.gisinternals.com/sdk/downloads/release-1930-x64-dev.zip",
};

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (large SDK over slow links)

function log(...args) {
  console.log("[download-gdal]", ...args);
}

function fatal(...args) {
  console.error("[download-gdal]", ...args);
  process.exit(1);
}

function looksLikeSdk(path) {
  return existsSync(join(path, "include", "gdal.h"));
}

function isRetryableError(err) {
  const retryableCodes = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
    "EAI_AGAIN",
  ]);
  return retryableCodes.has(err.code) || err.message === "socket hang up";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectsLeft) => {
      if (redirectsLeft <= 0) {
        reject(new Error("Too many redirects"));
        return;
      }

      log(`downloading ${currentUrl}`);
      const file = createWriteStream(dest);
      let lastLogged = 0;
      let totalMb = 0;

      const req = https
        .get(currentUrl, { timeout: TIMEOUT_MS }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            file.close();
            request(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            file.close();
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
            return;
          }

          totalMb = res.headers["content-length"]
            ? `${(Number(res.headers["content-length"]) / 1024 / 1024).toFixed(1)} MB`
            : "unknown size";
          log(`  size: ${totalMb}`);

          res.on("data", (chunk) => {
            const now = Date.now();
            if (now - lastLogged > 5000) {
              log(`  downloading...`);
              lastLogged = now;
            }
          });

          res.pipe(file);
          file.on("finish", () => {
            file.close(() => resolve());
          });
        })
        .on("error", (err) => {
          file.close();
          reject(err);
        });

      req.on("timeout", () => {
        req.destroy(new Error(`Download timed out after ${TIMEOUT_MS}ms`));
      });
    };

    request(url, 10);
  });
}

async function downloadFileWithRetry(url, dest, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await downloadFile(url, dest);
      return;
    } catch (err) {
      if (attempt === attempts || !isRetryableError(err)) {
        throw err;
      }
      log(`download attempt ${attempt} failed (${err.code || err.message}); retrying in ${attempt * 5}s...`);
      await sleep(attempt * 5000);
    }
  }
}

function findPython() {
  for (const exe of ["python", "py", "python3"]) {
    if (!spawnSync(exe, ["--version"], { shell: false }).error) return exe;
  }
  return null;
}

function unzip(zipPath, dest) {
  log(`extracting ${zipPath}`);
  mkdirSync(dest, { recursive: true });
  // Python's zipfile is available on every platform and avoids needing unzip.exe.
  const python = findPython();
  if (!python) {
    fatal("Python is required to extract the GDAL SDK but was not found in PATH.");
  }
  const result = spawnSync(python, ["-m", "zipfile", "-e", zipPath, dest], {
    stdio: "inherit",
    timeout: 120000,
  });
  if (result.status !== 0) {
    fatal(`Failed to extract ${zipPath} with Python zipfile.`);
  }
}

/**
 * Recursively search `dir` for the deepest directory that contains one of the
 * marker files. Marker paths are given as arrays of path parts, e.g.
 * `["include", "gdal.h"]`. This handles any archive layout: a single top-level
 * folder, nested folders, or loose files.
 */
function findSdkRoot(dir, markerPaths) {
  function walk(current) {
    if (!existsSync(current)) return null;

    for (const parts of markerPaths) {
      if (existsSync(join(current, ...parts))) {
        return current;
      }
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = walk(join(current, entry.name));
        if (found) return found;
      }
    }

    return null;
  }

  return walk(dir);
}

function copyDirContents(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

/**
 * Extract a GISInternals archive into a staging directory, locate the actual SDK
 * root inside it, and copy its contents into the destination prefix. This is
 * more reliable than the old hoisting/merge approach which assumed a single
 * top-level directory and used cross-directory renames.
 */
function extractArchiveInto(archivePath, dest, markerPaths, label) {
  const stage = join(dest, `.${label}-stage-${Date.now()}`);
  try {
    rmSync(stage, { recursive: true, force: true });
    unzip(archivePath, stage);
    const root = findSdkRoot(stage, markerPaths);
    if (!root) {
      fatal(
        `Could not locate ${label} SDK root in ${archivePath}. ` +
          `Expected a directory containing one of: ${markerPaths.map((p) => p.join("/")).join(", ")}`,
      );
    }
    log(`${label} SDK root: ${root}`);
    copyDirContents(root, dest);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const ifMissing = args.includes("--if-missing");
  const force = args.includes("--force");

  if (process.platform !== "win32") {
    log("Automatic GDAL download is only supported on Windows.");
    log("Install GDAL via your package manager and set GDAL_HOME, e.g.");
    log("  Debian/Ubuntu: sudo apt install libgdal-dev libproj-dev");
    log("  macOS:         brew install gdal");
    log("  then:          export GDAL_HOME=/usr");
    process.exit(0);
  }

  // If GDAL_HOME points to a usable SDK, the bundler will use it directly.
  if (process.env.GDAL_HOME && looksLikeSdk(process.env.GDAL_HOME)) {
    log(`GDAL_HOME is set (${process.env.GDAL_HOME}); skipping SDK download.`);
    return;
  }

  if (ifMissing && !force && looksLikeSdk(SDK_DIR)) {
    log(`SDK already present at ${SDK_DIR}`);
    return;
  }

  if (force) {
    rmSync(SDK_DIR, { recursive: true, force: true });
  }
  mkdirSync(SDK_DIR, { recursive: true });

  const runtimeZip = join(SDK_DIR, "runtime.zip");
  const libsZip = join(SDK_DIR, "libs.zip");

  try {
    await downloadFileWithRetry(URLS.runtime, runtimeZip);
    await downloadFileWithRetry(URLS.libs, libsZip);
  } catch (err) {
    fatal(`Download failed: ${err.message}\nCheck your network connection or install GDAL manually.`);
  }

  // Start from a clean slate inside SDK_DIR so stale partial extractions from
  // previous runs don't hide missing headers.
  for (const entry of readdirSync(SDK_DIR)) {
    if (entry === "runtime.zip" || entry === "libs.zip") continue;
    rmSync(join(SDK_DIR, entry), { recursive: true, force: true });
  }

  extractArchiveInto(
    runtimeZip,
    SDK_DIR,
    [
      ["bin", "gdalinfo.exe"],
      ["bin", "ogrinfo.exe"],
      ["bin", "gdal309.dll"],
      ["bin", "gdal.dll"],
    ],
    "runtime",
  );

  extractArchiveInto(
    libsZip,
    SDK_DIR,
    [
      ["include", "gdal.h"],
      ["lib", "gdal_i.lib"],
    ],
    "dev",
  );

  rmSync(runtimeZip, { force: true });
  rmSync(libsZip, { force: true });

  if (!looksLikeSdk(SDK_DIR)) {
    fatal(`Extracted SDK is missing include/gdal.h at ${SDK_DIR}`);
  }

  log(`GDAL SDK ready at ${SDK_DIR}`);
  log(`Use it by setting GDAL_HOME:`);
  log(`  $env:GDAL_HOME = '${SDK_DIR}'`);
  log(`Or run:`);
  log(`  npm run bundle:gdal`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
