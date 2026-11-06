"""
SiteSurveyor AI — Soil & Land Capability Engine (Category 3: SOIL)
===================================================================
Multi-criteria satellite-derived soil and land capability assessment.

Evidence layers:
  1. Erosion Risk       — slope × rainfall × bare-soil index            : 0.25
  2. Soil Moisture      — NDMI (Sentinel-2 SWIR)                        : 0.20
  3. Vegetation Vigor   — NDVI (Sentinel-2 NIR/Red)                     : 0.18
  4. Land Cover Class   — WorldCover suitability score                   : 0.15
  5. Topographic Wetness— TWI (DEM flow routing)                        : 0.12
  6. Rainfall Adequacy  — CHIRPS mean annual                             : 0.10

Outputs (outputs/):
  - soil_capability_map.png       — Full AOI land capability zoning
  - soil_evidence_layers.png      — Six-panel evidence layer mosaic
  - soil_zone_zoom.png            — 5×5 km zoom around client property
  - soil_capability_zones.tif     — Classified zone raster (uint8)
  - soil_capability_index.tif     — Continuous capability index (float32)
  - candidate_land_zones.csv/.geojson/.kml/.kmz — Highest-capability areas
  - soil_summary.json             — Numerical metadata for client report
"""
from __future__ import annotations

import gc

import json
import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Import config FIRST before rasterio/pyproj to ensure PROJ paths are initialized
import src.config as cfg

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch
import numpy as np
from rasterio.warp import Resampling

from src.utils.classification import (
    CLASS_NAMES,
    NODATA_CLASS,
    NODATA_HEX,
    classify_zones,
    finite_mean,
    find_candidate_sites,
    jenks_breaks,
    safe_round,
    zone_class,
)
from src.utils.export import export_candidates_kml, export_kmz
from src.utils.raster import pixel_to_lonlat, robust_norm, safe_savefig, warp, write_raster
from src.utils.spectral import bare_soil_index, ndmi, ndvi
from src.utils.terrain import fill_sinks, slope_degrees, twi

# ---------------------------------------------------------------------------
# Weights — versioned in src/config.py but mirrored here for standalone run
# ---------------------------------------------------------------------------
SOIL_WEIGHTS = {
    "erosion_risk":   0.25,
    "soil_moisture":  0.20,
    "vegetation":     0.18,
    "landcover":      0.15,
    "wetness":        0.12,
    "rainfall":       0.10,
}

# WorldCover class-to-land-capability mapping (0 = excluded, 1–5 = very low–very high)
# Score represents agricultural / land-use suitability potential
_LC_SUITABILITY = {
    10:  0.95,   # Tree cover → moderate (can be cleared / agroforestry)
    20:  0.90,   # Shrubland → moderate-good
    30:  1.00,   # Grassland → best for grazing/cultivation
    40:  1.00,   # Cropland → already used, highest suitability
    50:  0.00,   # Built-up → excluded
    60:  0.60,   # Bare / sparse veg → low (degraded)
    70:  0.00,   # Snow/Ice → excluded (not applicable in Zimbabwe)
    80:  0.00,   # Permanent water → excluded
    90:  0.50,   # Herbaceous wetland → marginal
    95:  0.00,   # Mangroves → excluded
    100: 0.80,   # Moss/lichen → marginal
}


def _lc_suitability_raster(lc: np.ndarray) -> np.ndarray:
    """Map WorldCover class integers to 0–1 land-capability suitability scores."""
    # Unobserved land cover stays NaN: zero would be read as "scored and
    # unusable", which is the opposite of "not measured".
    out = np.full(lc.shape, np.nan, dtype="float32")
    for cls_val, score in _LC_SUITABILITY.items():
        out[lc == cls_val] = score
    return out


def run_soil_survey(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> dict:
    """Execute complete Category 3: SOIL & LAND capability survey."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg=half_deg, client=client, address=address)

    # Ensure required raw rasters exist for active AOI, from the selected coverages
    from src.fetch_data import ensure_raw
    ensure_raw(["dem.tif", "landcover.tif", "rain_mean.tif", "optical.tif",
                "crop_mask.tif", "fc_ls_2023.tif"])

    print("=" * 65)
    print(f"SiteSurveyor AI — Running Category 3: Soil & Land Survey [{cfg.AOI_SLUG}]")
    print(f"Target: ({cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}) | Client: {cfg.CLIENT}")
    print("=" * 65)

    # ------------------------------------------------------------------
    # 1. Load satellite data layers
    # ------------------------------------------------------------------
    print("[1/6] Loading and reprojecting raw rasters...")
    dem       = warp(cfg.RAW / "dem.tif", 1)
    lc        = warp(cfg.RAW / "landcover.tif", 1, resampling=Resampling.nearest)
    rain      = warp(cfg.RAW / "rain_mean.tif", 1)

    # Reflectance from whichever Sentinel-2 aggregate this run selected, addressed by band
    # name so a product switch cannot quietly renumber it.
    red      = warp(cfg.RAW / "optical.tif", "red", scale=10000.0)
    nir      = warp(cfg.RAW / "optical.tif", "nir", scale=10000.0)
    swir1    = warp(cfg.RAW / "optical.tif", "swir_1", scale=10000.0)
    swir2    = warp(cfg.RAW / "optical.tif", "swir_2", scale=10000.0)

    # Check for DE Africa Sandbox Fractional Cover & Cropland Extent
    fc_path = cfg.RAW / "fc_ls_2023.tif"
    crop_path = cfg.RAW / "crop_mask.tif"

    # DE Africa Fractional Cover band order (verified via DescribeCoverage):
    #   pv 10/50/90 = 1/2/3, npv 10/50/90 = 4/5/6, bs 10/50/90 = 7/8/9, count_valid = 10
    fc_bs = None
    fc_pv = None
    fc_error = None
    if fc_path.exists():
        try:
            fc_bs = warp(fc_path, 8) / 100.0   # bs_pc_50  (median bare soil, %)
            fc_pv = warp(fc_path, 2) / 100.0   # pv_pc_50  (median photosynthetic veg, %)
            print("  [DE Africa Sandbox] Integrated Fractional Cover (BS/PV)")
        except Exception as e:
            fc_bs = None
            fc_pv = None
            fc_error = f"{type(e).__name__}: {e}"
            print(f"  [warn] Could not warp fc_ls: {e}")

    # crop_mask bands: mask = 1, prob = 2, filtered = 3
    crop_prob = None
    crop_error = None
    if crop_path.exists():
        try:
            crop_prob = warp(crop_path, 2) / 100.0   # probability of cropland, 0-100 %
            print("  [DE Africa Sandbox] Integrated Continental Cropland Extent")
        except Exception as e:
            crop_prob = None
            crop_error = f"{type(e).__name__}: {e}"
            print(f"  [warn] Could not warp crop_mask: {e}")

    # ------------------------------------------------------------------
    # 2. Terrain derivatives
    # ------------------------------------------------------------------
    print("[2/6] Computing terrain derivatives and flow routing...")
    slope    = slope_degrees(dem)
    filled   = fill_sinks(dem)
    twi_layer = twi(filled, slope_degrees(filled))

    # ------------------------------------------------------------------
    # 3. Spectral indices
    # ------------------------------------------------------------------
    print("[3/6] Computing spectral land-condition indices...")
    ndvi_layer   = ndvi(nir, red)      # vegetation health
    ndmi_layer   = ndmi(nir, swir1)    # canopy/soil moisture
    bsi_layer    = bare_soil_index(red, swir1, nir, swir2)  # bare/exposed soil

    # ------------------------------------------------------------------
    # 4. Evidence layer construction (each normalized 0–100)
    # ------------------------------------------------------------------
    print("[4/6] Building evidence layers...")

    # 4a. Erosion risk proxy = slope × rainfall × bare-soil
    #     High values = high erosion risk → INVERTED for capability (low erosion = good)
    if fc_bs is not None:
        bare_soil_proxy = np.clip(fc_bs, 0.05, 1.0)
    else:
        bare_soil_proxy = np.clip(bsi_layer + 1.0, 0.0, None)

    erosion_raw = slope * robust_norm(rain) * bare_soil_proxy
    erosion_risk_norm = robust_norm(erosion_raw)         # 0=low erosion, 1=high erosion
    erosion_cap  = 1.0 - erosion_risk_norm               # invert: 1=low erosion = good

    # 4b. Soil moisture (NDMI): invert — high moisture = good for agriculture
    moisture_norm = robust_norm(ndmi_layer)              # 0–1, 1=very moist

    # 4c. Vegetation vigor (NDVI / Fractional Cover PV): 1=dense/healthy
    if fc_pv is not None:
        veg_norm = robust_norm(0.5 * robust_norm(ndvi_layer) + 0.5 * np.clip(fc_pv, 0.0, 1.0))
    else:
        veg_norm = robust_norm(ndvi_layer)

    # 4d. Land cover suitability score
    lc_suit = _lc_suitability_raster(lc)                 # already 0–1
    if crop_prob is not None:
        active_crop_boost = np.clip(crop_prob, 0.0, 1.0)
        # fmax, not maximum: one unknown layer should not void the other.
        lc_suit = np.fmax(lc_suit, active_crop_boost * 0.95)

    # 4e. Topographic wetness (TWI): moderate TWI = best (not too wet, not too dry)
    #     Use a bell-curve: score peaks at ~65th percentile TWI, drops at extremes
    twi_norm = robust_norm(twi_layer)
    wetness_cap = 1.0 - 2.0 * np.abs(twi_norm - 0.60)   # peaks at 0.60 of range
    wetness_cap = np.clip(wetness_cap, 0.0, 1.0)

    # 4f. Rainfall adequacy: moderate→high rainfall = good (200–900 mm/yr optimal)
    rain_norm = robust_norm(rain)

    # Masks
    water_mask  = (lc == 80)
    builtup_mask = (lc == 50)

    # Zero out water & built-up pixels in evidence layers
    for layer in (erosion_cap, moisture_norm, veg_norm, lc_suit, wetness_cap, rain_norm):
        layer[water_mask | builtup_mask] = 0.0

    # ------------------------------------------------------------------
    # 5. Weighted index (AHP)
    # ------------------------------------------------------------------
    print("[5/6] Computing Soil Capability Index (AHP weighted sum)...")
    sci = (
        SOIL_WEIGHTS["erosion_risk"]  * erosion_cap  * 100 +
        SOIL_WEIGHTS["soil_moisture"] * moisture_norm * 100 +
        SOIL_WEIGHTS["vegetation"]    * veg_norm      * 100 +
        SOIL_WEIGHTS["landcover"]     * lc_suit       * 100 +
        SOIL_WEIGHTS["wetness"]       * wetness_cap   * 100 +
        SOIL_WEIGHTS["rainfall"]      * rain_norm     * 100
    ).astype("float32")

    sci[water_mask | builtup_mask] = 0.0

    # Natural-break classification
    breaks = jenks_breaks(sci[~(water_mask | builtup_mask) & np.isfinite(sci)], k=5)
    zones  = classify_zones(sci, breaks, water_mask=water_mask, builtup_mask=builtup_mask)

    # ------------------------------------------------------------------
    # 6. Target-site analytics
    # ------------------------------------------------------------------
    t_score = float(sci[cfg.TARGET_ROW, cfg.TARGET_COL])
    t_class = int(zones[cfg.TARGET_ROW, cfg.TARGET_COL])
    local_win = sci[
        max(0, cfg.TARGET_ROW - 5): cfg.TARGET_ROW + 6,
        max(0, cfg.TARGET_COL - 5): cfg.TARGET_COL + 6
    ]
    local_mean = finite_mean(local_win)
    local_class = zone_class(local_mean, breaks)

    class_names = CLASS_NAMES

    print(f"  Target SCI (cell)       : {t_score:.1f}/100  [{class_names.get(t_class, '?')}]")
    print(f"  Target SCI (150m mean)  : {local_mean:.1f}/100  [{class_names.get(local_class, '?')}]")

    # ------------------------------------------------------------------
    # 7. Candidate land zones
    # ------------------------------------------------------------------
    candidates = find_candidate_sites(
        sci, zones,
        min_class=3,           # Moderate or above (soil is more gradient than binary)
        min_distance_m=400.0,
        top_k=8,
        border_margin_px=25,
        proximity_weight=0.06,
    )
    print(f"  Candidate areas found   : {len(candidates)}")
    if candidates:
        print(f"  Closest to target       : {candidates[0]['distance_from_target_km']:.2f} km")

    # ------------------------------------------------------------------
    # 8. Export rasters
    # ------------------------------------------------------------------
    print("[6/6] Exporting rasters, maps, and deliverables...")
    write_raster(cfg.OUT / "soil_capability_index.tif", sci, dtype="float32", nodata=np.nan)
    write_raster(cfg.OUT / "soil_capability_zones.tif", zones, dtype="uint8", nodata=255)

    # CSV
    if candidates:
        csv_path = cfg.OUT / "candidate_land_zones.csv"
        import csv as _csv
        with open(csv_path, "w", newline="") as fh:
            writer = _csv.DictWriter(fh, fieldnames=list(candidates[0].keys()))
            writer.writeheader()
            writer.writerows(candidates)

        # GeoJSON
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point",
                                 "coordinates": [c["longitude"], c["latitude"]]},
                    "properties": {k: v for k, v in c.items()
                                   if k not in ("row", "col")},
                }
                for c in candidates
            ],
        }
        with open(cfg.OUT / "candidate_land_zones.geojson", "w") as fh:
            json.dump(geojson, fh, indent=2)

        # KML / KMZ
        kml_path = cfg.OUT / "candidate_land_zones.kml"
        kmz_path = cfg.OUT / "candidate_land_zones.kmz"
        export_candidates_kml(candidates, kml_path, survey_name="Soil & Land Capability")
        export_kmz(kml_path, kmz_path)

    # ------------------------------------------------------------------
    # 9. Maps
    # ------------------------------------------------------------------
    _plot_soil_map(sci, zones, candidates)
    _plot_evidence_layers(erosion_cap, moisture_norm, veg_norm,
                          lc_suit, wetness_cap, rain_norm, lc)
    _plot_zone_zoom(sci, zones, candidates)

    # ------------------------------------------------------------------
    # 10. Summary JSON
    # ------------------------------------------------------------------
    summary = {
        "category": "SOIL_LAND",
        "client": cfg.CLIENT,
        "address": cfg.CLIENT_ADDRESS,
        "analyst": cfg.ANALYST,
        "target_lat": cfg.TARGET_LAT,
        "target_lon": cfg.TARGET_LON,
        "target_sci_score": safe_round(t_score, 1),
        "target_sci_class": class_names.get(t_class, "?"),
        "local_150m_mean_score": safe_round(local_mean, 1),
        "local_150m_class": class_names.get(local_class, "?"),
        "candidate_areas": candidates,
        "weights_used": SOIL_WEIGHTS,
        "jenks_breaks": [round(float(b), 2) for b in breaks],
        "deafrica_sandbox": {
            "fractional_cover_integrated": fc_bs is not None and fc_pv is not None,
            "cropland_mask_integrated": crop_prob is not None,
            "fractional_cover_file_present": fc_path.exists(),
            "cropland_mask_file_present": crop_path.exists(),
            "fractional_cover_error": fc_error,
            "cropland_mask_error": crop_error,
            "target_bare_soil_pct": safe_round(fc_bs[cfg.TARGET_ROW, cfg.TARGET_COL] * 100.0, 1) if fc_bs is not None else None,
            "target_green_veg_pct": safe_round(fc_pv[cfg.TARGET_ROW, cfg.TARGET_COL] * 100.0, 1) if fc_pv is not None else None,
            "target_cropland_prob_pct": safe_round(crop_prob[cfg.TARGET_ROW, cfg.TARGET_COL] * 100.0, 1) if crop_prob is not None else None,
        },
        "aoi_grid_px": f"{cfg.WIDTH}×{cfg.HEIGHT}",
        "cell_size_m": cfg.CELL,
    }
    with open(cfg.OUT / "soil_summary.json", "w") as fh:
        json.dump(summary, fh, indent=2)

    print("\n[OK] Category 3 SOIL complete. Outputs in:", cfg.OUT)
    return summary


# ---------------------------------------------------------------------------
# Plotting helpers
# ---------------------------------------------------------------------------
_ZONE_COLORS = ["#c0c0c0", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
_ZONE_LABELS = ["Water/Built-up", "Very Low", "Low", "Moderate", "High", "Very High"]
_ZONE_CMAP   = ListedColormap(["#2166ac"] + _ZONE_COLORS[1:] + ["#808080"])


def _plot_soil_map(sci, zones, candidates):
    zone_colors = ["#2166ac", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850", "#808080"]
    cmap = ListedColormap(zone_colors)

    fig, ax = plt.subplots(figsize=(10, 10))
    cmap.set_bad(color=NODATA_HEX)
    ax.imshow(np.ma.masked_equal(zones, NODATA_CLASS), cmap=cmap, vmin=0, vmax=6, interpolation="none")

    # Overlay SCI as semi-transparent gradient
    masked_sci = np.ma.masked_where(zones == 0, sci / 100.0)
    ax.imshow(masked_sci, cmap="Greens", alpha=0.35, vmin=0, vmax=1)

    # Candidate markers
    for c in candidates:
        ax.plot(c["col"], c["row"], "^", ms=10, color="yellow",
                markeredgecolor="black", markeredgewidth=0.8, zorder=5)
        ax.annotate(f"Z{c['rank']}", (c["col"], c["row"]),
                    textcoords="offset points", xytext=(5, 5),
                    fontsize=7, color="white",
                    bbox=dict(boxstyle="round,pad=0.2", fc="black", alpha=0.6))

    # Target marker
    ax.plot(cfg.TARGET_COL, cfg.TARGET_ROW, "s", ms=12, color="red",
            markeredgecolor="white", markeredgewidth=1.5, zorder=6)
    ax.annotate("Client\nProperty", (cfg.TARGET_COL, cfg.TARGET_ROW),
                textcoords="offset points", xytext=(10, -15),
                fontsize=8, color="red", fontweight="bold")

    # Legend
    patches = [
        Patch(color=zone_colors[0], label="Water"),
        Patch(color=zone_colors[1], label="Very Low"),
        Patch(color=zone_colors[2], label="Low"),
        Patch(color=zone_colors[3], label="Moderate"),
        Patch(color=zone_colors[4], label="High"),
        Patch(color=zone_colors[5], label="Very High"),
        Patch(color=zone_colors[6], label="Built-up"),
    ]
    if (zones == NODATA_CLASS).any():
        patches.append(Patch(color=NODATA_HEX, label="No satellite coverage"))
    ax.legend(handles=patches, loc="lower right", fontsize=8,
              framealpha=0.85, title="Land Capability")

    ax.set_title(
        f"Soil & Land Capability Zoning — {cfg.CLIENT}\n"
        f"{cfg.TARGET_LAT:.4f}°S, {cfg.TARGET_LON:.4f}°E  |  Eineva Labs",
        fontsize=11, color=cfg.BRAND_COLOR, pad=12
    )
    ax.set_xlabel("Column (← W    E →)")
    ax.set_ylabel("Row (↑ N    S ↓)")
    ax.tick_params(labelsize=7)

    fig.text(0.5, 0.01,
             "⚠ Screening-level satellite analysis only. Not an engineering or agronomic certification.",
             ha="center", fontsize=7, color="gray", style="italic")

    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "soil_capability_map.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax
    gc.collect()
    print("  [OK] soil_capability_map.png")


def _plot_evidence_layers(erosion, moisture, veg, lc_suit, wetness, rainfall, lc):
    layers = [
        (erosion,   "Erosion Resistance",  "RdYlGn"),
        (moisture,  "Soil Moisture (NDMI)", "Blues"),
        (veg,       "Vegetation Vigor (NDVI)", "Greens"),
        (lc_suit,   "Land Cover Suitability", "YlGn"),
        (wetness,   "Topographic Wetness",  "PuBu"),
        (rainfall,  "Rainfall Adequacy",    "BuPu"),
    ]
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    for ax, (data, title, cmap) in zip(axes.flat, layers):
        im = ax.imshow(data, cmap=cmap, interpolation="bilinear", vmin=0, vmax=1)
        ax.plot(cfg.TARGET_COL, cfg.TARGET_ROW, "rs", ms=8,
                markeredgecolor="white", markeredgewidth=1)
        ax.set_title(title, fontsize=9, color=cfg.BRAND_COLOR)
        ax.set_xticks([]); ax.set_yticks([])
        plt.colorbar(im, ax=ax, fraction=0.03, pad=0.03)

    fig.suptitle(
        f"Soil & Land Evidence Layers — {cfg.CLIENT} | Eineva Labs",
        fontsize=12, color=cfg.BRAND_COLOR, y=1.01
    )
    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "soil_evidence_layers.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, axes
    gc.collect()
    print("  [OK] soil_evidence_layers.png")


def _plot_zone_zoom(sci, zones, candidates):
    """5×5 km zoom centred on target property."""
    zoom_km = 2.5
    zoom_px = int(zoom_km * 1000 / cfg.CELL)

    r0 = max(0, cfg.TARGET_ROW - zoom_px)
    r1 = min(cfg.HEIGHT, cfg.TARGET_ROW + zoom_px)
    c0 = max(0, cfg.TARGET_COL - zoom_px)
    c1 = min(cfg.WIDTH, cfg.TARGET_COL + zoom_px)

    sci_z   = sci[r0:r1, c0:c1]
    zones_z = zones[r0:r1, c0:c1]

    zone_colors = ["#2166ac", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850", "#808080"]
    cmap = ListedColormap(zone_colors)

    fig, ax = plt.subplots(figsize=(8, 8))
    cmap.set_bad(color=NODATA_HEX)
    ax.imshow(np.ma.masked_equal(zones_z, NODATA_CLASS), cmap=cmap, vmin=0, vmax=6, interpolation="none")

    masked_sci = np.ma.masked_where(zones_z == 0, sci_z / 100.0)
    ax.imshow(masked_sci, cmap="Greens", alpha=0.4, vmin=0, vmax=1)

    # Target
    ax.plot(cfg.TARGET_COL - c0, cfg.TARGET_ROW - r0, "rs", ms=14,
            markeredgecolor="white", markeredgewidth=2, zorder=6)
    ax.annotate("Client\nProperty",
                (cfg.TARGET_COL - c0, cfg.TARGET_ROW - r0),
                textcoords="offset points", xytext=(10, -18),
                fontsize=9, color="red", fontweight="bold")

    # Candidates in zoom window
    for c in candidates:
        cr, cc = c["row"], c["col"]
        if r0 <= cr < r1 and c0 <= cc < c1:
            ax.plot(cc - c0, cr - r0, "^", ms=11, color="yellow",
                    markeredgecolor="black", markeredgewidth=0.8, zorder=5)
            ax.annotate(f"Z{c['rank']}\n{c['potential_score']:.0f}pts",
                        (cc - c0, cr - r0),
                        textcoords="offset points", xytext=(6, 6),
                        fontsize=7.5, color="white",
                        bbox=dict(boxstyle="round,pad=0.25", fc="black", alpha=0.65))

    ax.set_title(
        f"Land Capability Zoom — 5×5 km around Client Property\n"
        f"{cfg.CLIENT} | {cfg.CLIENT_ADDRESS}",
        fontsize=10, color=cfg.BRAND_COLOR, pad=10
    )
    ax.set_xlabel("← West   East →")
    ax.set_ylabel("← North   South →")
    ax.tick_params(labelsize=7)

    fig.text(0.5, 0.01,
             "⚠ Satellite screening only. Agronomic field verification required.",
             ha="center", fontsize=7, color="gray", style="italic")
    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "soil_zone_zoom.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax
    gc.collect()
    print("  [OK] soil_zone_zoom.png")


if __name__ == "__main__":
    run_soil_survey()

