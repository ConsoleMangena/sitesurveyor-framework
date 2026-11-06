"""
SiteSurveyor AI — Groundwater Potential Engine (Category 1: WATER)
==================================================================
Multi-criteria decision analysis (AHP) for groundwater potential zoning
and prioritised borehole siting around target site (Gweru, Zimbabwe).

Evidence layers:
  1. Lineament density (SAR L-band HV + DEM hillshade) : 0.26
  2. Slope (Copernicus DEM 30m)                         : 0.18
  3. Topographic Wetness Index (TWI via D8 routing)     : 0.18
  4. Land cover infiltration capacity (ESA WorldCover)  : 0.12
  5. Drainage density (DEM stream networks)             : 0.10
  6. Mean annual rainfall (CHIRPS monthly)              : 0.08
  7. Vegetation vigor / moisture (Sentinel-2 optical)    : 0.08
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
    CLASS_NAMES,
    NODATA_CLASS,
    NODATA_RGB,
    classify_zones,
    finite_mean,
    find_candidate_sites,
    jenks_breaks,
    paint_zones,
    safe_round,
    zone_class,
)
from src.utils import depth
from src.utils.lineaments import (
    detect_lineaments, effective_min_length_m, extract_edges, lineament_density,
)
from src.utils.raster import pixel_to_lonlat, robust_norm, safe_savefig, warp, write_raster
from src.utils.spectral import ndvi
from src.utils.terrain import (
    d8_flow,
    drainage_density,
    fill_sinks,
    height_above_channel,
    slope_degrees,
    terrain_hillshade,
    twi,
)


def run_water_survey(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> dict:
    """Execute complete Category 1: WATER groundwater potential survey."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg=half_deg, client=client, address=address)

    # Ensure required raw rasters exist for active AOI, from the selected coverages
    from src.fetch_data import ensure_raw
    ensure_raw(["dem.tif", "landcover.tif", "alos.tif", "rain_mean.tif", "optical.tif"])

    print("=" * 65)
    print(f"SiteSurveyor AI — Running Category 1: Groundwater Survey [{cfg.AOI_SLUG}]")
    print(f"Target: ({cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}) | Client: {cfg.CLIENT}")
    print("=" * 65)

    # 1. Load data layers
    print("[1/6] Loading and reprojecting raw rasters...")
    dem = warp(cfg.RAW / "dem.tif", 1)
    lc = warp(cfg.RAW / "landcover.tif", 1, resampling=Resampling.nearest)
    alos_hv = warp(cfg.RAW / "alos.tif", 2)
    rain = warp(cfg.RAW / "rain_mean.tif", 1)
    red = warp(cfg.RAW / "optical.tif", "red", scale=10000.0)
    nir = warp(cfg.RAW / "optical.tif", "nir", scale=10000.0)

    # 2. Terrain and hydrological modeling
    print("[2/6] Modeling terrain derivatives, D8 flow, and TWI...")
    water_mask = (lc == 80)
    saturated_mask = np.isin(lc, (90, 95))
    slope = slope_degrees(dem)
    hs = terrain_hillshade(dem)
    filled = fill_sinks(dem)
    flow_slope = slope_degrees(filled)
    flow_dir, flow_acc = d8_flow(filled)
    twi_layer = twi(filled, flow_slope, flow_acc=flow_acc)
    drain_dens = drainage_density(flow_acc, threshold=500, kernel_radius=17,
                                 valid_mask=np.isfinite(filled))

    # The same routing that produced TWI also says how high each cell sits above the
    # valley floor it drains to, and that height is what depth to water is read from.
    channels = flow_acc >= cfg.DEPTH_MODEL["channel_catchment_cells"]
    hac = height_above_channel(dem, filled, flow_dir, channels)
    water_table = depth.groundwater_table(hac, surface_water=water_mask, saturated=saturated_mask)
    del filled, flow_slope, flow_acc, flow_dir, channels
    gc.collect()

    # 3. Structural fracture extraction
    print("[3/6] Detecting structural lineaments (SAR + DEM hillshade)...")
    edges = extract_edges(alos_hv, hs)
    segments = detect_lineaments(edges, threshold=25, min_length_px=30, line_gap_px=5, min_length_meters=600.0)
    lin_dens = lineament_density(segments, kernel_radius_px=17,
                                 valid_mask=np.isfinite(alos_hv) & np.isfinite(hs))
    del edges, alos_hv
    gc.collect()
    print(f"      Extracted {len(segments)} valid regional lineament segments "
          f"(>= {effective_min_length_m(30, 600.0):.0f} m at {cfg.CELL:.0f} m cells)")

    # 4. Infiltration, NDVI & rainfall
    print("[4/6] Processing land cover infiltration, NDVI, and rainfall...")
    infil_map = {
        10: 0.8,  # Trees
        20: 0.7,  # Shrubland
        30: 0.6,  # Grassland
        40: 0.5,  # Cropland
        50: 0.1,  # Built-up
        60: 0.3,  # Bare
        70: 0.1,  # Snow and ice
        80: 0.0,  # Water
        90: 0.9,  # Wetland
        95: 0.9,  # Mangrove
        100: 0.8,  # Moss / lichen
    }
    # Unobserved land cover stays NaN: asserting "impervious" from missing data
    # would invert the meaning of a no-data pixel into the lowest infiltration score.
    infil = np.full_like(lc, np.nan, dtype="float32")
    for k, v in infil_map.items():
        infil[lc == k] = v

    ndvi_layer = ndvi(nir, red)
    del red, nir
    gc.collect()

    # 5. Evidence normalization & weighted overlay
    print("[5/6] Multi-criteria weighted overlay (AHP)...")
    norm_lin = robust_norm(lin_dens)
    norm_slope = 1.0 - robust_norm(slope)  # Flatter slopes favor infiltration
    norm_twi = robust_norm(twi_layer)
    norm_infil = robust_norm(infil)
    norm_drain = robust_norm(drain_dens)
    norm_rain = robust_norm(rain)
    norm_ndvi = robust_norm(ndvi_layer)

    w = cfg.WATER_WEIGHTS
    index_raw = (
        w["lineament_density"] * norm_lin +
        w["slope"] * norm_slope +
        w["twi"] * norm_twi +
        w["landcover_infiltration"] * norm_infil +
        w["drainage_density"] * norm_drain +
        w["rainfall"] * norm_rain +
        w["ndvi"] * norm_ndvi
    )

    # Rescale to 0-100 continuous index
    gwpz_index = robust_norm(index_raw) * 100.0
    del index_raw, norm_slope, norm_twi, norm_infil, norm_drain, norm_rain, norm_ndvi
    gc.collect()

    # Masks for settlements (open water was masked where the depth model needed it)
    builtup_mask = (lc == 50)

    # Natural breaks classification
    valid_scores = gwpz_index[np.isfinite(gwpz_index) & ~water_mask & ~builtup_mask]
    breaks = jenks_breaks(valid_scores, k=5)
    print(f"      Natural breaks (k=5): {[round(float(b), 1) for b in breaks]}")

    classes = classify_zones(gwpz_index, breaks, water_mask=water_mask, builtup_mask=builtup_mask)

    # Target site assessment
    tr, tc = cfg.TARGET_ROW, cfg.TARGET_COL
    t_score = float(gwpz_index[tr, tc])
    t_class = int(classes[tr, tc])
    class_names = CLASS_NAMES

    # Local 5x5 window (150m buffer) around target to avoid single-pixel noise
    r0, r1 = max(0, tr - 2), min(cfg.HEIGHT, tr + 3)
    c0, c1 = max(0, tc - 2), min(cfg.WIDTH, tc + 3)
    local_mean = finite_mean(gwpz_index[r0:r1, c0:c1])
    local_class = zone_class(local_mean, breaks)

    print(f"      Target Coordinate Cell: {t_score:.1f}/100 ({class_names.get(t_class)})")
    print(f"      Target 150m Parcel Mean: {local_mean:.1f}/100 ({class_names.get(local_class)})")

    # Candidate borehole site picking (with border exclusion and proximity weighting)
    candidates = find_candidate_sites(
        gwpz_index, classes, min_class=4, min_distance_m=300.0, top_k=8,
        target_row=tr, target_col=tc, border_margin_px=25, proximity_weight=0.08
    )
    print(f"      Identified {len(candidates)} high-potential borehole candidates (prioritized by proximity)")

    # Attach what a crew mobilises on: how high above the valley floor each site sits,
    # the depth that implies at both ends of the season, and what stands on the ground.
    for cand in candidates:
        r, c = cand["row"], cand["col"]
        lc_code = int(lc[r, c]) if np.isfinite(lc[r, c]) else None
        cand["elevation_m"] = safe_round(dem[r, c], 1)
        cand["height_above_channel_m"] = safe_round(hac[r, c], 1)
        cand["depth_to_water_wet_m"] = safe_round(water_table["wet"][r, c], 1)
        cand["depth_to_water_dry_m"] = safe_round(water_table["dry"][r, c], 1)
        cand["borehole_read"] = depth.borehole_read(water_table["dry"][r, c])
        cand["slope_degrees"] = safe_round(slope[r, c], 1)
        cand["twi"] = safe_round(twi_layer[r, c], 2)
        cand["ndvi"] = safe_round(ndvi_layer[r, c], 3)
        cand["rainfall_mm_month"] = safe_round(rain[r, c], 1)
        cand["landcover"] = cfg.LANDCOVER_NAMES.get(lc_code)
        cand["field_notes"] = [
            f"Water table: {cand['depth_to_water_wet_m']}-{cand['depth_to_water_dry_m']} m "
            "below surface (wet to dry season)",
            f"Construction read: {cand['borehole_read']}",
            f"{cand['height_above_channel_m']} m above the valley floor it drains to",
            f"Elevation: {cand['elevation_m']} m | Slope: {cand['slope_degrees']}° | "
            f"TWI: {cand['twi']}",
        ]

    if candidates:
        first = candidates[0]
        print(f"      #1 water table expected at {first['depth_to_water_wet_m']}"
              f"-{first['depth_to_water_dry_m']} m below surface "
              f"({first['height_above_channel_m']} m above the valley floor) — "
              f"{first['borehole_read']}")

    # 6. Export rasters, vectors, maps, and metadata
    print("[6/6] Exporting GeoTIFFs, vectors, maps, and JSON summary...")

    # A. Write Rasters
    write_raster(cfg.OUT / "groundwater_potential_zones.tif", classes, dtype="uint8", nodata=255)
    write_raster(cfg.OUT / "gwpz_index.tif", gwpz_index, dtype="float32", nodata=np.nan)

    # B. Write Candidate CSV
    candidate_fields = [
        "rank", "latitude", "longitude", "potential_score", "class_name",
        "distance_from_target_km", "elevation_m", "slope_degrees",
        "height_above_channel_m", "depth_to_water_wet_m", "depth_to_water_dry_m",
        "borehole_read", "landcover", "twi", "ndvi", "rainfall_mm_month",
    ]
    csv_path = cfg.OUT / "candidate_borehole_sites.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=candidate_fields,
                                extrasaction="ignore")
        writer.writeheader()
        for cand in candidates:
            writer.writerow(cand)

    # C. Write Candidate GeoJSON
    geojson_features = []
    for cand in candidates:
        geojson_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [cand["longitude"], cand["latitude"]]},
            "properties": {key: cand.get(key) for key in candidate_fields if key != "rank"},
        })
    geojson_data = {"type": "FeatureCollection", "features": geojson_features}
    (cfg.OUT / "candidate_borehole_sites.geojson").write_text(json.dumps(geojson_data, indent=2))

    # D. Compute Area Statistics
    cell_km2 = (cfg.CELL * cfg.CELL) / 1e6
    area_stats = {}
    for code, name in class_names.items():
        count = int(np.sum(classes == code))
        area_stats[name] = {
            "area_km2": round(count * cell_km2, 2),
            "percentage": round(count / (cfg.WIDTH * cfg.HEIGHT) * 100.0, 1),
        }

    # Save scalar indicators before releasing evidence rasters
    t_slope = safe_round(slope[tr, tc], 2)
    t_twi = safe_round(twi_layer[tr, tc], 2)
    t_lin = safe_round(norm_lin[tr, tc] * 100, 1)
    t_ndvi = safe_round(ndvi_layer[tr, tc], 3)
    t_elev = safe_round(dem[tr, tc], 1)
    t_hac = safe_round(hac[tr, tc], 1)
    t_wet = safe_round(water_table["wet"][tr, tc], 1)
    t_dry = safe_round(water_table["dry"][tr, tc], 1)
    t_landcover = cfg.LANDCOVER_NAMES.get(int(lc[tr, tc]) if np.isfinite(lc[tr, tc]) else None)
    del norm_lin

    # E. Render Cartographic Maps
    _render_evidence_map(dem, slope, twi_layer, lin_dens, ndvi_layer, rain, infil, drain_dens)
    del dem, slope, twi_layer, lin_dens, ndvi_layer, rain, infil, drain_dens
    del hac, water_table["wet"], water_table["dry"]
    gc.collect()

    _render_main_map(gwpz_index, classes, hs, candidates, breaks)
    _render_zoom_map(classes, hs, candidates)
    gc.collect()

    # F. Save JSON Summary
    summary = {
        "project": "SiteSurveyor AI — Groundwater Potential Screening",
        "client": cfg.CLIENT,
        "address": cfg.CLIENT_ADDRESS,
        "analyst": cfg.ANALYST,
        "target_coordinates": {"latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON},
        "target_assessment": {
            "coordinate_cell_score": safe_round(t_score, 1),
            "coordinate_cell_class": class_names.get(t_class),
            "parcel_mean_150m": safe_round(local_mean, 1),
            "parcel_class_150m": class_names.get(local_class),
            "elevation_m": t_elev,
            "slope_degrees": t_slope,
            "twi": t_twi,
            "lineament_density_pct": t_lin,
            "ndvi": t_ndvi,
            "landcover": t_landcover,
            "height_above_channel_m": t_hac,
            "depth_to_water_wet_m": t_wet,
            "depth_to_water_dry_m": t_dry,
            "borehole_read": depth.borehole_read(t_dry),
        },
        "screening_depth_model": depth.groundwater_basis(),
        "model_weights": cfg.WATER_WEIGHTS,
        "natural_breaks": [round(float(b), 1) for b in breaks],
        "class_area_distribution": area_stats,
        "candidate_sites": candidates,
    }
    (cfg.OUT / "summary.json").write_text(json.dumps(summary, indent=2))

    # G. Export Mobile KML and KMZ for Smartphone GPS
    from src.utils.export import export_candidates_kml, export_kmz
    kml_path = cfg.OUT / "candidate_borehole_sites.kml"
    kmz_path = cfg.OUT / "candidate_borehole_sites.kmz"
    export_candidates_kml(candidates, kml_path, survey_name="Groundwater Potential")
    export_kmz(kml_path, kmz_path)

    print(f"\n[DONE] Survey completed successfully! Outputs available in {cfg.OUT}")
    return summary


def _render_main_map(index: np.ndarray, classes: np.ndarray, hs: np.ndarray, candidates: list[dict], breaks: np.ndarray):
    """Render high-resolution cartographic classified groundwater potential map."""
    fig, ax = plt.subplots(figsize=(10, 10), dpi=cfg.MAP_DPI)

    # Palette: Water (Blue), Very Low (Red), Low (Orange), Moderate (Yellow), High (Light Green), Very High (Dark Green), Builtup (Purple/Gray)
    colors = ["#1f77b4", "#d73027", "#f46d43", "#fdae61", "#a6d96a", "#1a9850", "#7f7f7f"]
    cmap = ListedColormap(colors)

    # Blend with hillshade. No-data cells are drawn flat gray: without this they
    # would saturate the palette lookup and print as "Very High Potential".
    void = classes == NODATA_CLASS
    shaded = paint_zones(classes, cmap, hs)

    ax.imshow(shaded, extent=[0, cfg.WIDTH * cfg.CELL / 1000, 0, cfg.HEIGHT * cfg.CELL / 1000])

    # Plot target site
    tx_km = cfg.TARGET_COL * cfg.CELL / 1000
    ty_km = (cfg.HEIGHT - cfg.TARGET_ROW) * cfg.CELL / 1000
    ax.scatter(tx_km, ty_km, marker="*", s=220, color="yellow", edgecolors="black", linewidths=1.5, zorder=10, label="Client Target Site")

    # Plot top candidate borehole sites
    for cand in candidates:
        cx_km = cand["col"] * cfg.CELL / 1000
        cy_km = (cfg.HEIGHT - cand["row"]) * cfg.CELL / 1000
        ax.scatter(cx_km, cy_km, marker="o", s=110, color="cyan", edgecolors="black", linewidths=1.2, zorder=9)
        ax.annotate(f"#{cand['rank']}", (cx_km + 0.3, cy_km + 0.3), fontsize=9, fontweight="bold", color="black",
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="black", alpha=0.85), zorder=11)

    ax.set_title(f"Groundwater Potential Zones (GWPZ) — {cfg.CLIENT}\nTarget: {cfg.TARGET_LAT:.4f}°S, {cfg.TARGET_LON:.4f}°E ({cfg.CLIENT_ADDRESS})", fontsize=11, color=cfg.BRAND_COLOR, pad=12)
    ax.set_xlabel("Easting (km)", fontsize=10)
    ax.set_ylabel("Northing (km)", fontsize=10)

    # Custom legend
    legend_elements = [
        Patch(facecolor="#1a9850", edgecolor="k", label="Very High Potential"),
        Patch(facecolor="#a6d96a", edgecolor="k", label="High Potential"),
        Patch(facecolor="#fdae61", edgecolor="k", label="Moderate Potential"),
        Patch(facecolor="#f46d43", edgecolor="k", label="Low Potential"),
        Patch(facecolor="#d73027", edgecolor="k", label="Very Low Potential"),
        Patch(facecolor="#7f7f7f", edgecolor="k", label="Built-up (Excluded)"),
        Patch(facecolor="#1f77b4", edgecolor="k", label="Water Body"),
    ]
    if void.any():
        legend_elements.append(Patch(facecolor=NODATA_RGB, edgecolor="k", label="No satellite coverage"))
    ax.legend(handles=legend_elements, loc="lower right", framealpha=0.9, fontsize=8)

    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "groundwater_potential_map.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax, shaded
    gc.collect()


def _render_evidence_map(dem, slope, twi_arr, lin, ndvi_arr, rain, infil, drain):
    """Render 8-panel diagnostic plot of all evidence layers."""
    fig, axes = plt.subplots(2, 4, figsize=(16, 8), dpi=cfg.MAP_DPI)
    panels = [
        ("DEM Elevation (m)", dem, "terrain"),
        ("Slope (degrees)", slope, "magma"),
        ("Topographic Wetness (TWI)", twi_arr, "YlGnBu"),
        ("Lineament Density (km/km²)", lin, "plasma"),
        ("NDVI (optical composite)", ndvi_arr, "YlGn"),
        ("Rainfall (CHIRPS mm/mo)", rain, "Blues"),
        ("Infiltration Capacity", infil, "YlOrRd"),
        ("Drainage Density (km/km²)", drain, "Blues"),
    ]

    for ax, (title, arr, cm) in zip(axes.flat, panels):
        im = ax.imshow(arr, cmap=cm)
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.axis("off")
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    plt.suptitle(f"SiteSurveyor AI — Groundwater Evidence Layers [{cfg.CLIENT}]", fontsize=13, color=cfg.BRAND_COLOR, y=0.98)
    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "evidence_layers.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, axes
    gc.collect()


def _render_zoom_map(classes: np.ndarray, hs: np.ndarray, candidates: list[dict]):
    """Render 5x5 km local zoom centered on target site."""
    fig, ax = plt.subplots(figsize=(7, 7), dpi=cfg.MAP_DPI)

    # 5x5 km window around target (approx 167x167 pixels)
    half_px = int(2500 / cfg.CELL)
    r0, r1 = max(0, cfg.TARGET_ROW - half_px), min(cfg.HEIGHT, cfg.TARGET_ROW + half_px)
    c0, c1 = max(0, cfg.TARGET_COL - half_px), min(cfg.WIDTH, cfg.TARGET_COL + half_px)

    sub_cls = classes[r0:r1, c0:c1]
    sub_hs = hs[r0:r1, c0:c1]

    colors = ["#1f77b4", "#d73027", "#f46d43", "#fdae61", "#a6d96a", "#1a9850", "#7f7f7f"]
    cmap = ListedColormap(colors)
    shaded = paint_zones(sub_cls, cmap, sub_hs)

    extent = [(c0 - cfg.TARGET_COL) * cfg.CELL / 1000, (c1 - cfg.TARGET_COL) * cfg.CELL / 1000,
              (cfg.TARGET_ROW - r1) * cfg.CELL / 1000, (cfg.TARGET_ROW - r0) * cfg.CELL / 1000]

    ax.imshow(shaded, extent=extent)
    ax.scatter(0, 0, marker="*", s=260, color="yellow", edgecolors="black", linewidths=1.5, zorder=10, label="Client Site")

    for cand in candidates:
        dx = (cand["col"] - cfg.TARGET_COL) * cfg.CELL / 1000
        dy = (cfg.TARGET_ROW - cand["row"]) * cfg.CELL / 1000
        if extent[0] <= dx <= extent[1] and extent[2] <= dy <= extent[3]:
            ax.scatter(dx, dy, marker="o", s=130, color="cyan", edgecolors="black", linewidths=1.2, zorder=9)
            ax.annotate(f"#{cand['rank']}", (dx + 0.1, dy + 0.1), fontsize=9, fontweight="bold",
                        bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="black", alpha=0.85), zorder=11)

    ax.set_title(f"5×5 km Local Site Siting Map — {cfg.CLIENT}\nRelative offset from Client Property (km)", fontsize=10, color=cfg.BRAND_COLOR)
    ax.set_xlabel("Offset East (km)")
    ax.set_ylabel("Offset North (km)")
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend(loc="lower right", fontsize=8)

    fig.tight_layout()
    safe_savefig(fig, cfg.OUT / "site_zoom_map.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    del fig, ax, shaded
    gc.collect()


if __name__ == "__main__":
    run_water_survey()
