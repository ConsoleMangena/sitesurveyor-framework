# SiteSurveyor backend (Tauri + Rust)

Native desktop shell and the pure-Rust survey engine. Geospatial work is split
deliberately between two layers so the **same** geometry code runs on the web
(WebAssembly) and the desktop (native), while heavyweight C-library bindings
stay desktop-only.

## Geospatial stack

### GeoRust (WASM-safe, always on) — `crates/survey-core`

These are pure-Rust [GeoRust](https://georust.org) crates. They compile into
both `survey-wasm` (browser) and the desktop shell, so behaviour is identical
everywhere:

| Crate       | Used for                                                        |
| ----------- | --------------------------------------------------------------- |
| `geo`       | area, convex hull, simplify (RDP), centroid, point-in-polygon, bounds (`geom.rs`) |
| `geo-types` | shared `Coord`/`LineString`/`Polygon` types                     |
| `geojson`   | GeoJSON import/export (`geojson_io.rs`)                          |
| `wkt`       | Well-Known-Text geometry interchange                            |
| `contour`   | marching-squares isolines for gridded sources (`contour.rs`)    |
| `spade`     | Delaunay triangulation for the TIN (`tin.rs`)                   |

Run the engine tests:

```bash
cargo test -p survey-core
```

### Native C-library bindings (desktop-only, feature-gated) — root crate

`gdal` and `proj` are GeoRust bindings to the **system** GDAL and PROJ C
libraries. They **cannot** compile to WASM, so they live in the root crate
only, behind Cargo features, and the frontend degrades gracefully when they are
absent (see `frontend/.../survey/reprojectBridge.ts`).

| Feature     | Crate       | Capability                              | Native dependency           |
| ----------- | ----------- | --------------------------------------- | --------------------------- |
| `proj`      | `proj` 0.27 | true datum/CRS transforms (`reproject`) | PROJ ≥ 9                     |
| `gdal`      | `gdal` 0.19 | GeoTIFF/DEM raster + vector I/O         | GDAL ≥ 3                     |
| `gdal-bindgen` | `gdal` 0.19 (bindgen) | Same as `gdal`; generates bindings at build time | GDAL 3.12+ (needs libclang) |
| `shapefile` | `shapefile` | ESRI Shapefile import (pure Rust)       | none                        |
| `las`       | `las`       | LiDAR `.las`/`.laz` point clouds        | none                        |

Each command exposes an `*_available()` probe (`proj_available`,
`gdal_available`, …) so the UI can detect support at runtime, and every
implementation has a `#[cfg(not(feature = ...))]` stub that returns a clear
"not compiled in" error instead of failing to build.

## Building

Default build (GeoRust only, no native C libs required):

```bash
cargo build              # or: cargo check / cargo test
```

Enable the native geospatial features (requires the system libraries below):

```bash
cargo build --features proj,gdal,shapefile,las
```

### Windows development

Local Windows development is meant to use an OSGeo4W GDAL install. Install OSGeo4W
with the GDAL-dev package and optionally set `GDAL_HOME` to the `apps/gdal-dev`
folder.

```powershell
cd C:\Users\THINKPAD\Documents\sitesurveyorsdk
npm install
$env:GDAL_HOME = "C:\OSGeo4W\apps\gdal-dev"
npm run tauri:dev:win
```

`npm run tauri:dev:win` will:
1. Use `GDAL_HOME` if it is already set.
2. Otherwise look for an OSGeo4W install in the usual locations
   (`C:\OSGeo4W64`, `C:\OSGeo4W`, or `%OSGEO4W_ROOT%`).

If no local GDAL is found, the script fails with instructions to install OSGeo4W.
Automatic SDK downloads are reserved for the GitHub Actions release workflow.

### Bundled GDAL runtime

The Windows desktop installer ships its own GDAL/PROJ runtime in `backend/bundled-gdal`,
which is bundled as a Tauri resource and loaded at app startup. End users do **not**
need OSGeo4W or any other system GDAL install.

The GitHub Actions release workflow downloads a self-contained Windows GDAL SDK from
GISInternals into `backend/gdal-sdk/` and exports `GDAL_HOME` before building, so the
release pipeline does not depend on a runner-hosted GDAL install.

### Building

Default build (GeoRust only, no native C libs required):

```bash
cargo build              # or: cargo check / cargo test
```

Enable the native geospatial features on Windows:

```powershell
cd backend
$env:GDAL_HOME = "C:\OSGeo4W\apps\gdal-dev"
npm run cargo:build:gdal           # cargo build --features gdal
```

Desktop development with live reload:

```powershell
cd C:\Users\THINKPAD\Documents\sitesurveyorsdk
$env:GDAL_HOME = "C:\OSGeo4W\apps\gdal-dev"
npm run tauri:dev:win
```

Packaged installer (bundles GDAL for redistribution):

```powershell
cd backend
$env:GDAL_HOME = "C:\OSGeo4W\apps\gdal-dev"
npm run bundle:gdal   # collects runtime GDAL from GDAL_HOME
npm run tauri:build   # builds Tauri installer including the bundled runtime
```

`gdal-sys` reads `GDAL_HOME` (and, if necessary, `GDAL_VERSION`) directly, so no
wrapper script is required for linking.

> `gdal-sys` ships prebuilt bindings up to a certain GDAL version. If your
> installed GDAL is newer, set `GDAL_VERSION` to the latest supported binding
> (e.g., `3.9.0`) before building. The GDAL C API is backward-compatible, so
> building against older bindings and running against newer DLLs is safe for the
> subset of functions this app uses.

## Tauri commands

`src/survey.rs` exposes the engine and the geospatial bridges over IPC; they are
registered in `src/lib.rs`. The web build calls the equivalent `survey-wasm`
exports instead, so never make a web feature depend on a desktop command.
