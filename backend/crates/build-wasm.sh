#!/usr/bin/env bash
#
# Build the survey-wasm crate to a web-target package consumed by the frontend.
#
# Output goes to frontend/src/features/projects/components/cad/survey/wasm/
# (gitignored — generated artifact). The TS bridge lazy-loads it; if the package
# is absent at runtime the bridge transparently falls back to its pure-TS path,
# so the web build never breaks even without this step.
#
# The wasm module now also exposes the GeoRust `geo`/`geojson` algorithms
# (polygon_area, convex_hull, simplify, centroid, point_in_polygon, bounds,
# model_to_geojson, model_from_geojson) in addition to the TIN/contour/volume
# functions. These are all pure Rust and compile cleanly to wasm32. The native
# `proj` datum transforms are NOT part of this build (they cannot target wasm);
# they live in the desktop Tauri crate behind `--features proj`.
#
# Requirements: rustup target wasm32-unknown-unknown + wasm-pack.
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-pack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$SCRIPT_DIR/survey-wasm"
OUT_DIR="$SCRIPT_DIR/../../frontend/src/features/projects/components/cad/survey/wasm"

echo "Building survey-wasm -> $OUT_DIR"
wasm-pack build "$CRATE_DIR" \
  --target web \
  --release \
  --out-dir "$OUT_DIR" \
  --out-name survey_wasm

echo "survey-wasm build complete."
