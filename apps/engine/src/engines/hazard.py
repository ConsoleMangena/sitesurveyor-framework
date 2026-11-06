"""
SiteSurveyor AI — Hazard & Risk Intelligence Engine (Category 5: HAZARD)
========================================================================
Multi-criteria satellite-derived natural hazard and site safety screening.

Evidence layers:
  1. Flood Inundation & Ponding Hazard (WOfS frequency + TWI in flat depressions) : 0.30
  2. Slope Failure & Steep Terrain Risk (Copernicus DEM slope > 15 deg)           : 0.20
  3. Erosion & Washout Susceptibility (Slope x flow accumulation x bare soil)     : 0.20
  4. Wildfire Fuel & Exposure Risk (Dry grass/biomass: NDVI high + NDMI deficit)  : 0.15
  5. Drought Vulnerability (Rainfall deficit + low moisture persistence)          : 0.15

Outputs (outputs/):
  - hazard_risk_map.png         — Multi-hazard spatial zoning map
  - hazard_evidence_layers.png  — Five-panel evidence mosaic
  - site_hazard_zoom.png        — 5x5 km site safety & risk zoom
  - hazard_composite_index.tif  — Continuous 0-100 hazard index (higher = greater risk)
  - hazard_risk_zones.tif       — Classified zone raster (uint8: 1=Very Low ... 5=Very High)
  - hazard_safe_sites.csv/.geojson/.kml/.kmz — Top recommended lowest-risk buildable sites
  - hazard_summary.json         — Quantitative site risk assessment
"""
from __future__ import annotations

import gc

import csv
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


def run_hazard_survey(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> dict:
    """Execute complete Category 5: HAZARD & ENVIRONMENTAL RISK survey."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg=half_deg, client=client, address=address)

    # Ensure required raw rasters exist for active AOI, from the selected coverages
    from src.fetch_data import ensure_raw
    ensure_raw(["dem.tif", "landcover.tif", "rain_mean.tif", "optical.tif",
                "wofs.tif", "fc_ls_2023.tif"])

    print("=" * 65)
    print(f"SiteSurveyor AI -- Running Category 5: Hazard & Risk Survey [{cfg.AOI_SLUG}]")
    print(f"Target: ({cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}) | Client: {cfg.CLIENT}")
    print("=" * 65)

    # ------------------------------------------------------------------
    # 1. Load data layers
    # ------------------------------------------------------------------
    print("[1/6] Loading and reprojecting raw rasters...")
    dem = warp(cfg.RAW / "dem.tif", 1)
    lc = warp(cfg.RAW / "landcover.tif", 1, resampling=Resampling.nearest)
    rain = warp(cfg.RAW / "rain_mean.tif", 1)

    # WOfS: Band 3 is water inundation frequency (0.0 to 1.0)
    wofs_freq = warp(cfg.RAW / "wofs.tif", 3)

    # Sentinel-2 reflectance, addressed by band name
    red = warp(cfg.RAW / "optical.tif", "red", scale=10000.0)
    nir = warp(cfg.RAW / "optical.tif", "nir", scale=10000.0)
    swir1 = warp(cfg.RAW / "optical.tif", "swir_1", scale=10000.0)
    swir2 = warp(cfg.RAW / "optical.tif", "swir_2", scale=10000.0)

    # DE Africa Fractional Cover: band 6 = npv_pc_90, band 8 = bs_pc_50
    # (verified order: pv 10/50/90, npv 10/50/90, bs 10/50/90, count_valid)
    fc_path = cfg.RAW / "fc_ls_2023.tif"
    fc_npv_peak = None
    fc_bs = None
    fc_error = None
    if fc_path.exists():
        try:
            fc_npv_peak = warp(fc_path, 6) / 100.0  # npv_pc_90 (peak dry biomass)
            fc_bs = warp(fc_path, 8) / 100.0  # bs_pc_50 (median bare soil)
            print("      Integrated DE Africa Fractional Cover (NPV peak fuel, BS median)")
        except Exception as e:
            fc_npv_peak = None
            fc_bs = None
            fc_error = f"{type(e).__name__}: {e}"
            print(f"      [warn] Fractional Cover could not be warped, substituting BSI proxy: {e}")

    # ------------------------------------------------------------------
    # 2. Terrain & hydrological modeling
    # ------------------------------------------------------------------
    print("[2/6] Modeling terrain slope, flow routing, and ponding...")
    slope = slope_degrees(dem)
    filled = fill_sinks(dem)
    twi_layer = twi(filled, slope_degrees(filled))

    # ------------------------------------------------------------------
    # 3. Spectral indices
    # ------------------------------------------------------------------
    print("[3/6] Computing spectral vegetation & soil moisture stress...")
    ndvi_layer = ndvi(nir, red)
    ndmi_layer = ndmi(nir, swir1)
    bsi_layer = bare_soil_index(red, swir1, nir, swir2)

    # ------------------------------------------------------------------
    # 4. Construct hazard sub-layers (0 to 1 scale, 1 = highest hazard)
    # ------------------------------------------------------------------
    print("[4/6] Synthesizing multi-hazard evidence layers...")

    # Layer 1: Flood & Inundation Hazard
    # Direct historical water frequency + topographic ponding in flat terrain (slope < 2 deg and high TWI)
    twi_norm = robust_norm(twi_layer)
    # A NaN slope compared as "not flat" would score data-void terrain as safe,
    # so the flag is kept NaN wherever the terrain is unobserved.
    flat_flag = np.where(np.isfinite(slope), (slope < 2.5).astype("float32"), np.nan)
    flat_depression = flat_flag * twi_norm
    flood_hazard = np.clip(wofs_freq * 3.0 + flat_depression * 0.7, 0.0, 1.0)

    # Layer 2: Slope Failure / Landslide Risk
    # Low risk < 5 deg, moderate 5-15 deg, high > 15 deg
    slope_hazard = np.clip((slope - 3.0) / 18.0, 0.0, 1.0)

    # Layer 3: Soil Erosion & Washout Hazard
    # Slope combined with calibrated bare soil or empirical BSI
    if fc_bs is not None:
        bs_exposure = np.clip(fc_bs, 0.05, 1.0)
        erosion_hazard = robust_norm(slope * (bs_exposure + 0.2))
    else:
        bsi_norm = robust_norm(np.clip(bsi_layer, -0.5, 0.5))
        erosion_hazard = robust_norm(slope * (bsi_norm + 0.2))

    # Layer 4: Wildfire Fuel & Dry Biomass Hazard
    # High vegetation fuel coupled with moisture deficit (low NDMI) in grassland/shrub/tree cover
    moisture_deficit = 1.0 - robust_norm(ndmi_layer)
    if fc_npv_peak is not None:
        # DE Africa Non-Photosynthetic Vegetation (cured grass, crop residue, dry brush)
        dry_fuel_proxy = np.clip(fc_npv_peak, 0.0, 1.0)
        composite_fuel = 0.6 * dry_fuel_proxy + 0.4 * np.clip(ndvi_layer, 0.0, 1.0)
        fire_hazard = robust_norm(composite_fuel * moisture_deficit)
    else:
        fuel_load = np.clip(ndvi_layer, 0.0, 1.0)
        fire_hazard = robust_norm(fuel_load * moisture_deficit)

    # Zero out fire risk on water or bare rock/settlement
    fire_hazard[(lc == 50) | (lc == 80)] = 0.1

    # Layer 5: Drought Vulnerability
    # Lower rainfall relative to region + high bare soil ratio
    rain_norm = robust_norm(rain)
    rain_deficit = 1.0 - rain_norm
    drought_hazard = robust_norm(0.6 * rain_deficit + 0.4 * (fc_bs if fc_bs is not None else bsi_norm))

    # ------------------------------------------------------------------
    # 5. Composite Hazard Index (0 to 100)
    # ------------------------------------------------------------------
    print("[5/6] Computing Composite Site Hazard Index (AHP weighted sum)...")
    hazard_index = (
        cfg.HAZARD_WEIGHTS["flood_inundation"] * flood_hazard * 100.0 +
        cfg.HAZARD_WEIGHTS["slope_failure"]    * slope_hazard * 100.0 +
        cfg.HAZARD_WEIGHTS["erosion_washout"]  * erosion_hazard * 100.0 +
        cfg.HAZARD_WEIGHTS["wildfire_fuel"]    * fire_hazard * 100.0 +
        cfg.HAZARD_WEIGHTS["drought_stress"]   * drought_hazard * 100.0
    ).astype("float32")

    water_mask = (lc == 80)
    builtup_mask = (lc == 50)
    # Permanent water has maximal flood hazard
    hazard_index[water_mask] = 100.0

    # Natural-break classification for Hazard Zones
    # 1: Very Low Hazard, 2: Low, 3: Moderate, 4: High, 5: Very High
    valid_vals = hazard_index[np.isfinite(hazard_index)]
    breaks = jenks_breaks(valid_vals, k=5)
    hazard_zones = classify_zones(hazard_index, breaks, water_mask=water_mask)

    # Site Safety Index (100 = Safest, 0 = Most hazardous)
    safety_index = (100.0 - hazard_index).astype("float32")
    safety_index[water_mask] = 0.0

    # Target site assessment
    t_hazard = float(hazard_index[cfg.TARGET_ROW, cfg.TARGET_COL])
    t_safety = float(safety_index[cfg.TARGET_ROW, cfg.TARGET_COL])
    t_class = int(hazard_zones[cfg.TARGET_ROW, cfg.TARGET_COL])

    local_win = hazard_index[
        max(0, cfg.TARGET_ROW - 5): cfg.TARGET_ROW + 6,
        max(0, cfg.TARGET_COL - 5): cfg.TARGET_COL + 6
    ]
    local_mean_hazard = finite_mean(local_win)
    local_hazard_class = zone_class(local_mean_hazard, breaks)

    hazard_class_names = {
        NODATA_CLASS: "No data (no satellite coverage)",
        0: "Water Body",
        1: "Very Low Hazard (Safe)",
        2: "Low Hazard (Minor Risk)",
        3: "Moderate Hazard (Precautions Advised)",
        4: "High Hazard (Engineering Mitigation)",
        5: "Very High Hazard (Restricted/Unsafe)",
        6: "Built-up",
    }

    print(f"  Target Hazard Score     : {t_hazard:.1f}/100 [{hazard_class_names.get(t_class, '?')}]")
    print(f"  Target Safety Score     : {t_safety:.1f}/100 (100 = Optimal)")
    print(f"  150m Parcel Mean Hazard : {local_mean_hazard:.1f}/100 [{hazard_class_names.get(local_hazard_class, '?')}]")

    # ------------------------------------------------------------------
    # 6. Siting: Identify Safest Low-Risk Buildable Sites
    # ------------------------------------------------------------------
    # Use safety index to pick the top safest buildable locations near property
    safety_breaks = jenks_breaks(safety_index[np.isfinite(safety_index)], k=5)
    safety_classes = classify_zones(safety_index, safety_breaks, water_mask=water_mask)

    safest_sites = find_candidate_sites(
        safety_index,
        safety_classes,
        min_class=4,
        min_distance_m=350.0,
        top_k=8,
        border_margin_px=25,
        proximity_weight=0.06,
    )
    print(f"  Safest buildable sites  : {len(safest_sites)}")
    if safest_sites:
        print(f"  Closest safe build site : {safest_sites[0]['distance_from_target_km']:.2f} km (Safety: {safest_sites[0]['potential_score']:.1f}/100)")

    # ------------------------------------------------------------------
    # 7. Export GeoTIFFs, vectors, and KML/KMZ
    # ------------------------------------------------------------------
    print("[6/6] Exporting GeoTIFFs, maps, and deliverables...")
    write_raster(cfg.OUT / "hazard_composite_index.tif", hazard_index, dtype="float32", nodata=np.nan)
    write_raster(cfg.OUT / "hazard_risk_zones.tif", hazard_zones, dtype="uint8", nodata=255)
    write_raster(cfg.OUT / "site_safety_index.tif", safety_index, dtype="float32", nodata=np.nan)

    # Candidate Safe Sites CSV & GeoJSON
    if safest_sites:
        csv_path = cfg.OUT / "safest_buildable_sites.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(safest_sites[0].keys()))
            writer.writeheader()
            writer.writerows(safest_sites)

        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [c["longitude"], c["latitude"]]},
                    "properties": {k: v for k, v in c.items() if k not in ("row", "col")},
                }
                for c in safest_sites
            ],
        }
        with open(cfg.OUT / "safest_buildable_sites.geojson", "w", encoding="utf-8") as fh:
            json.dump(geojson, fh, indent=2)

        kml_path = cfg.OUT / "safest_buildable_sites.kml"
        kmz_path = cfg.OUT / "safest_buildable_sites.kmz"
        export_candidates_kml(safest_sites, kml_path, survey_name="Site Safety & Hazard Due Diligence")
        export_kmz(kml_path, kmz_path)

    # ------------------------------------------------------------------
    # 8. Render Maps
    # ------------------------------------------------------------------
    _plot_hazard_map(hazard_index, hazard_zones, safest_sites)
    _plot_hazard_evidence(flood_hazard, slope_hazard, erosion_hazard, fire_hazard, drought_hazard)
    _plot_hazard_zoom(hazard_index, hazard_zones, safest_sites)

    # ------------------------------------------------------------------
    # 9. Summary Metadata JSON
    # ------------------------------------------------------------------
    summary = {
        "category": "HAZARD_RISK",
        "client": cfg.CLIENT,
        "address": cfg.CLIENT_ADDRESS,
        "analyst": cfg.ANALYST,
        "target_coordinates": {"latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON},
        "target_assessment": {
            "hazard_index_score": safe_round(t_hazard, 1),
            "hazard_classification": hazard_class_names.get(t_class, "Unknown"),
            "safety_index_score": safe_round(t_safety, 1),
            "local_150m_mean_hazard": safe_round(local_mean_hazard, 1),
            "local_150m_hazard_class": hazard_class_names.get(local_hazard_class, "Unknown"),
            "sub_hazard_breakdown": {
                "flood_inundation_risk": safe_round(flood_hazard[cfg.TARGET_ROW, cfg.TARGET_COL] * 100, 1),
                "slope_failure_risk": safe_round(slope_hazard[cfg.TARGET_ROW, cfg.TARGET_COL] * 100, 1),
                "erosion_washout_risk": safe_round(erosion_hazard[cfg.TARGET_ROW, cfg.TARGET_COL] * 100, 1),
                "wildfire_fuel_risk": safe_round(fire_hazard[cfg.TARGET_ROW, cfg.TARGET_COL] * 100, 1),
                "drought_vulnerability": safe_round(drought_hazard[cfg.TARGET_ROW, cfg.TARGET_COL] * 100, 1),
            },
        },
        "model_weights": cfg.HAZARD_WEIGHTS,
        "jenks_breaks": [round(float(b), 2) for b in breaks],
        "deafrica_sandbox": {
            "fractional_cover_integrated": fc_bs is not None and fc_npv_peak is not None,
            "fractional_cover_file_present": fc_path.exists(),
            "fractional_cover_error": fc_error,
            "target_peak_dry_fuel_pct": safe_round(fc_npv_peak[cfg.TARGET_ROW, cfg.TARGET_COL] * 100.0, 1) if fc_npv_peak is not None else None,
            "target_bare_soil_pct": safe_round(fc_bs[cfg.TARGET_ROW, cfg.TARGET_COL] * 100.0, 1) if fc_bs is not None else None,
        },
        "safest_candidate_sites": safest_sites,
    }
    with open(cfg.OUT / "hazard_summary.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)

    print("\n[OK] Category 5 HAZARD complete. Outputs in:", cfg.OUT)
    return summary


# ---------------------------------------------------------------------------
# Cartographic Visualizations
# ---------------------------------------------------------------------------
def _plot_hazard_map(hazard_index, hazard_zones, safest_sites):
    """Regional multi-hazard risk zoning map."""
    # Palette: Green (Very Low Hazard) -> Yellow -> Orange -> Red (Very High Hazard)
    hazard_colors = ["#2166ac", "#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027", "#808080"]
    cmap = ListedColormap(hazard_colors)

    fig, ax = plt.subplots(figsize=(10, 10))
    cmap.set_bad(color=NODATA_HEX)
    ax.imshow(np.ma.masked_equal(hazard_zones, NODATA_CLASS), cmap=cmap, vmin=0, vmax=6, interpolation="none")

    # Transparent continuous hazard overlay
    ax.imshow(hazard_index / 100.0, cmap="YlOrRd", alpha=0.35, vmin=0, vmax=1)

    # Safest sites markers
    for s in safest_sites:
        ax.plot(s["col"], s["row"], "o", ms=9, color="#00ffcc",
                markeredgecolor="black", markeredgewidth=1.0, zorder=5)
        ax.annotate(f"S{s['rank']}", (s["col"], s["row"]),
                    textcoords="offset points", xytext=(5, 5),
                    fontsize=7, color="black", fontweight="bold",
                    bbox=dict(boxstyle="round,pad=0.2", fc="#00ffcc", alpha=0.8))

    # Client target marker
    ax.plot(cfg.TARGET_COL, cfg.TARGET_ROW, "s", ms=12, color="blue",
            markeredgecolor="white", markeredgewidth=1.5, zorder=6)
    ax.annotate("Client\nProperty", (cfg.TARGET_COL, cfg.TARGET_ROW),
                textcoords="offset points", xytext=(10, -15),
                fontsize=8, color="blue", fontweight="bold")

    patches = [
        Patch(color=hazard_colors[0], label="Water Body"),
        Patch(color=hazard_colors[1], label="Very Low Hazard (Safe)"),
        Patch(color=hazard_colors[2], label="Low Hazard"),
        Patch(color=hazard_colors[3], label="Moderate Hazard"),
        Patch(color=hazard_colors[4], label="High Hazard"),
        Patch(color=hazard_colors[5], label="Very High Hazard"),
    ]
    if (hazard_zones == NODATA_CLASS).any():
        patches.append(Patch(color=NODATA_HEX, label="No satellite coverage"))
    ax.legend(handles=patches, loc="lower right", fontsize=8,
              framealpha=0.9, title="Environmental Risk Level")

    ax.set_title(
        f"Multi-Hazard & Environmental Risk Zoning -- {cfg.CLIENT}\n"
        f"{cfg.TARGET_LAT:.4f}S, {cfg.TARGET_LON:.4f}E | Eineva Labs",
        fontsize=11, color=cfg.BRAND_COLOR, pad=12
    )
    ax.set_xlabel("Column (West -> East)")
    ax.set_ylabel("Row (North -> South)")
    ax.tick_params(labelsize=7)

    fig.text(0.5, 0.01,
             "Satellite environmental risk screening. Engineering ground investigation required before construction.",
             ha="center", fontsize=7, color="gray", style="italic")

    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "hazard_risk_map.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax
    gc.collect()
    print("  [OK] hazard_risk_map.png")


def _plot_hazard_evidence(flood, slope, erosion, fire, drought):
    """5-panel multi-hazard evidence layers."""
    layers = [
        (flood,   "Flood & Ponding Hazard",      "Blues"),
        (slope,   "Slope Failure / Steep Terrain", "Oranges"),
        (erosion, "Soil Erosion & Washout Risk",  "YlOrBr"),
        (fire,    "Wildfire Fuel Hazard",        "Reds"),
        (drought, "Drought Vulnerability",        "Purples"),
    ]
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    axes_list = list(axes.flat)

    for ax, (data, title, cmap) in zip(axes_list[:5], layers):
        im = ax.imshow(data, cmap=cmap, interpolation="bilinear", vmin=0, vmax=1)
        ax.plot(cfg.TARGET_COL, cfg.TARGET_ROW, "bs", ms=8, markeredgecolor="white", markeredgewidth=1)
        ax.set_title(title, fontsize=9, color=cfg.BRAND_COLOR)
        ax.set_xticks([]); ax.set_yticks([])
        plt.colorbar(im, ax=ax, fraction=0.03, pad=0.03)

    # Empty 6th panel used for summary legend/info
    ax6 = axes_list[5]
    ax6.axis("off")
    info_text = (
        "SiteSurveyor AI Hazard Modeling:\n\n"
        "- Flood: DE Africa WOfS 1984-2024 water\n"
        "  frequency + DEM topographic ponding.\n\n"
        "- Slope Failure: Copernicus 30m DEM\n"
        "  gradient (>15 deg critical threshold).\n\n"
        "- Erosion: Slope x bare-soil index (BSI).\n\n"
        "- Wildfire: high fuel (NDVI) coupled\n"
        "  with dry moisture stress (NDMI).\n\n"
        "- Drought: CHIRPS long-term rainfall deficit\n"
        "  and vegetative exposure."
    )
    ax6.text(0.1, 0.5, info_text, transform=ax6.transAxes,
             fontsize=9, verticalalignment="center",
             bbox=dict(boxstyle="round,pad=0.8", facecolor="#f5f5f5", edgecolor="#cccccc"))

    fig.suptitle(
        f"Natural Hazard & Risk Evidence Layers -- {cfg.CLIENT} | Eineva Labs",
        fontsize=12, color=cfg.BRAND_COLOR, y=1.01
    )
    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "hazard_evidence_layers.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, axes
    gc.collect()
    print("  [OK] hazard_evidence_layers.png")


def _plot_hazard_zoom(hazard_index, hazard_zones, safest_sites):
    """5x5 km site safety & risk zoom map around client target property."""
    zoom_km = 2.5
    zoom_px = int(zoom_km * 1000 / cfg.CELL)

    r0 = max(0, cfg.TARGET_ROW - zoom_px)
    r1 = min(cfg.HEIGHT, cfg.TARGET_ROW + zoom_px)
    c0 = max(0, cfg.TARGET_COL - zoom_px)
    c1 = min(cfg.WIDTH, cfg.TARGET_COL + zoom_px)

    hz_z = hazard_zones[r0:r1, c0:c1]
    hi_z = hazard_index[r0:r1, c0:c1]

    hazard_colors = ["#2166ac", "#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027", "#808080"]
    cmap = ListedColormap(hazard_colors)

    fig, ax = plt.subplots(figsize=(8, 8))
    cmap.set_bad(color=NODATA_HEX)
    ax.imshow(np.ma.masked_equal(hz_z, NODATA_CLASS), cmap=cmap, vmin=0, vmax=6, interpolation="none")
    ax.imshow(hi_z / 100.0, cmap="YlOrRd", alpha=0.35, vmin=0, vmax=1)

    # Client Property
    ax.plot(cfg.TARGET_COL - c0, cfg.TARGET_ROW - r0, "bs", ms=14,
            markeredgecolor="white", markeredgewidth=2, zorder=6)
    ax.annotate("Client\nProperty",
                (cfg.TARGET_COL - c0, cfg.TARGET_ROW - r0),
                textcoords="offset points", xytext=(10, -18),
                fontsize=9, color="blue", fontweight="bold")

    # Safest buildable sites within zoom
    for s in safest_sites:
        sr, sc = s["row"], s["col"]
        if r0 <= sr < r1 and c0 <= sc < c1:
            ax.plot(sc - c0, sr - r0, "o", ms=11, color="#00ffcc",
                    markeredgecolor="black", markeredgewidth=1.0, zorder=5)
            ax.annotate(f"Safe #{s['rank']}\nScore: {s['potential_score']:.0f}/100",
                        (sc - c0, sr - r0),
                        textcoords="offset points", xytext=(6, 6),
                        fontsize=7.5, color="black", fontweight="bold",
                        bbox=dict(boxstyle="round,pad=0.25", fc="#00ffcc", alpha=0.75))

    ax.set_title(
        f"Site Safety & Risk Zoom -- 5x5 km around Client Property\n"
        f"{cfg.CLIENT} | {cfg.CLIENT_ADDRESS}",
        fontsize=10, color=cfg.BRAND_COLOR, pad=10
    )
    ax.set_xlabel("West -> East (km)")
    ax.set_ylabel("North -> South (km)")
    ax.tick_params(labelsize=7)

    fig.text(0.5, 0.01,
             "Screening-level analysis only. Not an engineering geotechnical certification.",
             ha="center", fontsize=7, color="gray", style="italic")
    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "site_hazard_zoom.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax
    gc.collect()
    print("  [OK] site_hazard_zoom.png")


if __name__ == "__main__":
    run_hazard_survey()

