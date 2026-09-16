#!/usr/bin/env node
/**
 * Remove the bundled GDAL runtime produced by bundle-gdal.mjs.
 *
 * Usage:
 *   node scripts/clean-gdal.mjs
 *
 * Environment:
 *   BUNDLE_TARGET    Output directory (default: backend/bundled-gdal)
 */

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_BUNDLE_TARGET = join(ROOT, "backend", "bundled-gdal");
const DEFAULT_SDK_TARGET = join(ROOT, "backend", "gdal-sdk");

function clean(target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(target)) {
    if (entry === ".gitkeep") continue;
    rmSync(join(target, entry), { recursive: true, force: true });
  }
  console.log(`[clean-gdal] cleaned ${target} (kept .gitkeep)`);
}

const bundleTarget = process.env.BUNDLE_TARGET ? resolve(process.env.BUNDLE_TARGET) : DEFAULT_BUNDLE_TARGET;
clean(bundleTarget);

const sdkTarget = process.env.SDK_TARGET ? resolve(process.env.SDK_TARGET) : DEFAULT_SDK_TARGET;
rmSync(sdkTarget, { recursive: true, force: true });
console.log(`[clean-gdal] removed ${sdkTarget}`);
