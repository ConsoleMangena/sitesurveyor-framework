"""
SiteSurveyor AI — Mineral Exploration & Prospectivity Engine (Category 2: MINERALS)
===================================================================================
Generates comprehensive multi-mineral exploration intelligence from Earth Observation:

1. A mineral prospectivity index and prioritised field exploration targets.
2. A multi-commodity mineral screen (`src/utils/commodities.py`): evaluates the same
   geological evidence (hydrothermal alteration, iron oxide/gossans, clay/hydroxyl,
   ferrous/mafic silicates, lineament density, structural intersections, and relief)
   re-weighted per deposit style to report all available/indicated minerals in the area
   (gold, iron ore, nickel/PGM, chromium, base metals, lithium, manganese, bauxite, REE)
   as well as unscreenable commodities.
"""
from __future__ import annotations

import csv
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
    NODATA_RGB,
    ZONE_PALETTES,
    classify_zones,
    export_classified_overlay,
    finite_mean,
    find_candidate_sites,
    jenks_breaks,
    paint_zones,
    safe_round,
    zone_class,
)
from src.utils import commodities as commodity_screen
from src.utils import depth
from src.utils.lineaments import detect_lineaments, extract_edges, lineament_density, lineament_intersections
from src.utils.raster import robust_norm, safe_savefig, warp, write_raster
from src.utils.spectral import ferrous_index, hydroxyl_index, iron_oxide_index, ndvi, residual_index
from src.utils.terrain import local_relief, slope_degrees, terrain_hillshade


def run_minerals_survey(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> dict:
    """Execute complete Category 2: MINERALS multi-commodity exploration survey."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg=half_deg, client=client, address=address)

    # Ensure required raw rasters exist for active AOI, from the selected coverages
    from src.fetch_data import ensure_raw
    ensure_raw(["dem.tif", "landcover.tif", "alos.tif", "optical.tif"])

    print("=" * 65)
    print(f"SiteSurveyor AI — Running Category 2: Mineral Exploration Survey [{cfg.AOI_SLUG}]")
    print(f"Target: ({cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}) | Focus: Multi-Commodity Exploration")
    print("=" * 65)

    # 1. Load data layers
    print("[1/6] Loading multi-spectral and terrain rasters...")
    dem = warp(cfg.RAW / "dem.tif", 1)
    lc = warp(cfg.RAW / "landcover.tif", 1, resampling=Resampling.nearest)
    alos_hv = warp(cfg.RAW / "alos.tif", 2)

    # Sentinel-2 bands for alteration, addressed by name
    blue = warp(cfg.RAW / "optical.tif", "blue", scale=10000.0)
    red = warp(cfg.RAW / "optical.tif", "red", scale=10000.0)
    nir = warp(cfg.RAW / "optical.tif", "nir", scale=10000.0)
    swir1 = warp(cfg.RAW / "optical.tif", "swir_1", scale=10000.0)
    swir2 = warp(cfg.RAW / "optical.tif", "swir_2", scale=10000.0)

    # 2. Structural Lineament & Intersection Analysis
    print("[2/6] Extracting structural lineaments and intersection nodes...")
    hs = terrain_hillshade(dem)
    edges = extract_edges(alos_hv, hs)
    segments = detect_lineaments(edges, threshold=25, min_length_px=30, line_gap_px=5, min_length_meters=600.0)
    structural_valid = np.isfinite(alos_hv) & np.isfinite(hs)
    lin_dens = lineament_density(segments, kernel_radius_px=17, valid_mask=structural_valid)
    inter_dens, inter_pts = lineament_intersections(segments, min_angle_diff=20.0, kernel_radius_px=17,
                                                    valid_mask=structural_valid)
    print(f"      Detected {len(segments)} regional segments and {len(inter_pts)} structural intersection nodes")

    # 3. Spectral Alteration Indices with Vegetation Residual Correction
    print("[3/6] Computing hydrothermal alteration indices & vegetation detrending...")
    ndvi_arr = ndvi(nir, red)

    raw_iron = iron_oxide_index(red, blue)
    raw_hyd = hydroxyl_index(swir1, swir2)
    raw_fer = ferrous_index(swir1, nir)

    iron_res = residual_index(raw_iron, ndvi_arr, deg=2)
    hyd_res = residual_index(raw_hyd, ndvi_arr, deg=2)
    fer_res = residual_index(raw_fer, ndvi_arr, deg=2)

    # Free raw spectral band memory early before heavy overlay
    del blue, red, nir, swir1, swir2, raw_iron, raw_hyd, raw_fer, ndvi_arr

    # 4. Terrain Roughness & Regional Endowment Context
    print("[4/6] Modeling terrain roughness and mineral endowment decay...")
    slope = slope_degrees(dem)
    relief = local_relief(dem)  # Height above the mean of the observed neighbourhood

    # The same two terrain numbers that give roughness also say whether a cell is where
    # material leaves or where it collects, which is what cover thickness turns on.
    cover_low, cover_high, cover_band = depth.overburden(slope, relief)

    # Roughness enters the prospectivity model as a magnitude; its sign only says
    # whether the cell sits on a rise or in a hollow.
    np.abs(relief, out=relief)

    # Known deposit locations (e.g. Golden Quarry Mine: -19.6127 S, 29.9842 E)
    from src.utils.raster import lonlat_to_pixel
    gq_row, gq_col = lonlat_to_pixel(29.9842, -19.6127)
    yy, xx = np.indices((cfg.HEIGHT, cfg.WIDTH))
    dist_gq_km = np.hypot(yy - gq_row, xx - gq_col) * cfg.CELL / 1000.0
    endowment = np.exp(-dist_gq_km / 15.0).astype("float32")  # 15 km decay radius
    del yy, xx, dist_gq_km

    # 5. Multi-criteria Weighted Overlay
    print("[5/6] Multi-criteria weighted prospectivity overlay...")
    norm_lin = robust_norm(lin_dens)
    norm_inter = robust_norm(inter_dens)
    norm_iron = robust_norm(iron_res)
    norm_hyd = robust_norm(hyd_res)
    norm_fer = robust_norm(fer_res)
    norm_relief = robust_norm(relief)
    del relief
    norm_endow = robust_norm(endowment)

    w = cfg.MINERAL_WEIGHTS
    index_raw = (
        w["lineament_density"] * norm_lin +
        w["lineament_intersections"] * norm_inter +
        w["iron_oxide"] * norm_iron +
        w["hydroxyl_clay"] * norm_hyd +
        w["ferrous_mafic"] * norm_fer +
        w["relative_relief"] * norm_relief +
        w["endowment"] * norm_endow
    )

    gold_index = robust_norm(index_raw) * 100.0
    del index_raw, endowment
    gc.collect()

    water_mask = (lc == 80)
    builtup_mask = (lc == 50)

    valid_scores = gold_index[np.isfinite(gold_index) & ~water_mask & ~builtup_mask]
    breaks = jenks_breaks(valid_scores, k=5)
    print(f"      Natural breaks (k=5): {[round(float(b), 1) for b in breaks]}")

    classes = classify_zones(gold_index, breaks, water_mask=water_mask, builtup_mask=builtup_mask)

    # Target site assessment
    tr, tc = cfg.TARGET_ROW, cfg.TARGET_COL
    t_score = float(gold_index[tr, tc])
    t_class = int(classes[tr, tc])
    class_names = CLASS_NAMES

    r0, r1 = max(0, tr - 2), min(cfg.HEIGHT, tr + 3)
    c0, c1 = max(0, tc - 2), min(cfg.WIDTH, tc + 3)
    local_mean = finite_mean(gold_index[r0:r1, c0:c1])
    local_class = zone_class(local_mean, breaks)

    print(f"      Target Coordinate Cell: {t_score:.1f}/100 ({class_names.get(t_class)})")
    print(f"      Target 150m Parcel Mean: {local_mean:.1f}/100 ({class_names.get(local_class)})")

    # Candidate exploration targets (with border exclusion and proximity weighting)
    candidates = find_candidate_sites(
        gold_index, classes, min_class=4, min_distance_m=500.0, top_k=8,
        target_row=tr, target_col=tc, border_margin_px=25, proximity_weight=0.03
    )
    print(f"      Identified {len(candidates)} high-potential mineral exploration targets")

    def field_read(row: int, col: int) -> dict:
        """
        Everything a crew asks for at one cell: how thick the cover should be, how deep
        the first hole has to go to prove it, and what each evidence layer reads there.
        """
        lc_code = int(lc[row, col]) if np.isfinite(lc[row, col]) else None
        test_hole = depth.test_hole_depth(cover_high[row, col])
        return {
            "elevation_m": safe_round(dem[row, col], 1),
            "slope_degrees": safe_round(slope[row, col], 1),
            "overburden_min_m": safe_round(cover_low[row, col], 1),
            "overburden_max_m": safe_round(cover_high[row, col], 1),
            "overburden_landform": depth.landform_name(cover_band[row, col]),
            "test_hole_depth_m": test_hole,
            "sampling_method": depth.sampling_read(test_hole),
            "lineament_density_pct": safe_round(norm_lin[row, col] * 100, 1),
            "intersection_density_pct": safe_round(norm_inter[row, col] * 100, 1),
            "iron_oxide_residual_pct": safe_round(norm_iron[row, col] * 100, 1),
            "hydroxyl_clay_residual_pct": safe_round(norm_hyd[row, col] * 100, 1),
            "ferrous_mafic_pct": safe_round(norm_fer[row, col] * 100, 1),
            "relative_relief_pct": safe_round(norm_relief[row, col] * 100, 1),
            "endowment_context_pct": safe_round(norm_endow[row, col] * 100, 1),
            "landcover": cfg.LANDCOVER_NAMES.get(lc_code),
        }

    for cand in candidates:
        cand.update(field_read(cand["row"], cand["col"]))
        cand["field_notes"] = [
            f"Cover: {cand['overburden_min_m']}-{cand['overburden_max_m']} m "
            f"({cand['overburden_landform'] or 'landform not resolvable'})",
            f"First test hole: {cand['test_hole_depth_m']} m — {cand['sampling_method']}",
            f"Lineament density percentile: {cand['lineament_density_pct']}",
            f"Elevation: {cand['elevation_m']} m | Slope: {cand['slope_degrees']}°",
        ]

    if candidates:
        first = candidates[0]
        print(f"      #1 cover expected {first['overburden_min_m']}-{first['overburden_max_m']} m"
              f" over {first['overburden_landform']} — first test hole to "
              f"{first['test_hole_depth_m']} m with {first['sampling_method']}")

    # ------------------------------------------------------------------
    # Commodity screen: the same evidence, re-weighted per deposit style.
    # ------------------------------------------------------------------
    print("[5/6] Screening the mineral systems this ground can support...")
    commodity_screen.validate()
    evidence_layers = {
        "lineament_density": norm_lin,
        "lineament_intersections": norm_inter,
        "iron_oxide": norm_iron,
        "hydroxyl_clay": norm_hyd,
        "ferrous_mafic": norm_fer,
        "relative_relief": norm_relief,
        "endowment": norm_endow,
    }
    excluded = water_mask | builtup_mask
    ranked_commodities = commodity_screen.rank_commodities(
        evidence_layers,
        mask=excluded,
        target=(tr, tc),
        indices={"gold": gold_index},
    )
    indicated = commodity_screen.headline(ranked_commodities)
    for item in ranked_commodities:
        flag = "INDICATED" if item["indicated"] else "not indicated"
        print(f"      {item['name'][:34]:34s} top decile {item['area_top_decile']:5.1f} "
              f"| {item['share_high_pct']:5.2f}% of area in the top class | {flag}")
    print("      Indicated: " + (", ".join(indicated) if indicated else "none of the screened systems"))

    # Enrich candidates with commodity scores and primary mineral affinity
    for cand in candidates:
        cr, cc = cand["row"], cand["col"]
        best_comm_name = None
        best_comm_score = -1.0
        for comm in commodity_screen.COMMODITIES:
            c_score = sum(comm.weights[k] * evidence_layers[k][cr, cc] for k in comm.weights if k in evidence_layers) * 100.0
            cand[f"{comm.key}_score"] = safe_round(c_score, 1)
            if c_score > best_comm_score:
                best_comm_score = c_score
                best_comm_name = comm.name
        cand["primary_commodity"] = best_comm_name
        cand["primary_commodity_score"] = safe_round(best_comm_score, 1)
        cand["indicated_minerals"] = ", ".join(indicated) if indicated else "None indicated"

        # Prepend mineral affinity and indicated commodities to field notes
        cand["field_notes"].insert(0, f"Primary mineral affinity: {cand['primary_commodity']} ({cand['primary_commodity_score']}/100)")
        cand["field_notes"].insert(1, f"Indicated minerals in area: {cand['indicated_minerals']}")

    # Snapshot the target before the layers it is read from are released
    target_fields = field_read(tr, tc)
    del dem, lc, slope, cover_low, cover_high, cover_band
    gc.collect()

    # 6. Export outputs
    print("[6/6] Exporting GeoTIFFs, vectors, maps, and JSON summary...")
    write_raster(cfg.OUT / "mineral_prospectivity_zones.tif", classes, dtype="uint8",
                 nodata=255, colors=ZONE_PALETTES["minerals"])
    write_raster(cfg.OUT / "mineral_prospectivity_index.tif", gold_index, dtype="float32", nodata=np.nan)
    export_classified_overlay(
        classes,
        cfg.OUT / "minerals_overlay.png",
        colors=ZONE_PALETTES["minerals"],
    )

    # Candidate CSV with commodity breakdown
    candidate_fields = [
        "rank", "latitude", "longitude", "potential_score", "class_name",
        "primary_commodity", "primary_commodity_score", "indicated_minerals",
        "distance_from_target_km", "elevation_m", "slope_degrees",
        "overburden_min_m", "overburden_max_m", "overburden_landform",
        "test_hole_depth_m", "sampling_method", "landcover",
        "gold_score", "base_metals_score", "lithium_score", "nickel_pgm_score",
        "iron_ore_score", "chromium_score", "manganese_score", "bauxite_score", "rare_earths_score",
        "lineament_density_pct", "intersection_density_pct",
        "iron_oxide_residual_pct", "hydroxyl_clay_residual_pct",
        "ferrous_mafic_pct", "relative_relief_pct", "endowment_context_pct",
    ]
    csv_path = cfg.OUT / "candidate_mineral_targets.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=candidate_fields, extrasaction="ignore")
        writer.writeheader()
        for cand in candidates:
            writer.writerow(cand)

    # Candidate GeoJSON
    geojson_features = []
    for cand in candidates:
        geojson_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [cand["longitude"], cand["latitude"]]},
            "properties": {key: cand.get(key) for key in candidate_fields if key != "rank"},
        })
    (cfg.OUT / "candidate_mineral_targets.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": geojson_features}, indent=2))

    # Export mineral commodities JSON and CSV
    commodity_payload = {
        "basis": (
            "Multi-criteria weighted overlay of alteration, structural, terrain and regional "
            "endowment evidence, re-weighted per deposit style. Scores are percentiles within "
            "this survey area, not grades or tonnages."
        ),
        "screening_depth_model": depth.overburden_basis(),
        "indicated": indicated,
        "commodities": ranked_commodities,
        "unscreenable": commodity_screen.unscreened_payload(),
        "excluded_classes": ["open water", "built-up ground"],
    }
    (cfg.OUT / "mineral_commodities.json").write_text(json.dumps(commodity_payload, indent=2))

    from src.utils.export import export_candidates_kml, export_kmz, export_mineral_commodities_csv
    export_mineral_commodities_csv(ranked_commodities, cfg.OUT / "mineral_commodities.csv")

    # Area statistics
    cell_km2 = (cfg.CELL * cfg.CELL) / 1e6
    area_stats = {}
    for code, name in class_names.items():
        count = int(np.sum(classes == code))
        area_stats[name] = {
            "area_km2": round(count * cell_km2, 2),
            "percentage": round(count / (cfg.WIDTH * cfg.HEIGHT) * 100.0, 1),
        }

    # Maps
    _render_minerals_map(gold_index, classes, hs, candidates)
    _render_minerals_evidence(norm_lin, norm_inter, norm_iron, norm_hyd, norm_fer, norm_relief, norm_endow)
    del gold_index, classes, hs, norm_lin, norm_inter, norm_iron, norm_hyd, norm_fer, norm_relief, norm_endow
    gc.collect()

    # JSON Summary
    summary = {
        "project": "SiteSurveyor AI — Mineral Exploration Screening",
        "client": cfg.CLIENT,
        "analyst": cfg.ANALYST,
        "target_coordinates": {"latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON},
        "target_assessment": {
            "coordinate_cell_score": safe_round(t_score, 1),
            "coordinate_cell_class": class_names.get(t_class),
            "parcel_mean_150m": safe_round(local_mean, 1),
            "parcel_class_150m": class_names.get(local_class),
            **target_fields,
        },
        "model_weights": cfg.MINERAL_WEIGHTS,
        "screening_depth_model": depth.overburden_basis(),
        "natural_breaks": [round(float(b), 1) for b in breaks],
        "class_area_distribution": area_stats,
        "candidate_targets": candidates,
        "mineral_commodities": ranked_commodities,
        "indicated_commodities": indicated,
        "unscreenable_commodities": commodity_screen.unscreened_payload(),
    }
    (cfg.OUT / "mineral_summary.json").write_text(json.dumps(summary, indent=2))

    # Export Mobile KML and KMZ for Smartphone GPS
    kml_path = cfg.OUT / "candidate_mineral_targets.kml"
    kmz_path = cfg.OUT / "candidate_mineral_targets.kmz"
    export_candidates_kml(
        candidates, kml_path, survey_name="Mineral Exploration & Prospectivity",
        footnote="Cover thickness and test-hole depth are DEM estimates to first ground, "
                 "not ore depth — confirm with a pit or auger hole.",
    )
    export_kmz(kml_path, kmz_path)

    print(f"\n[DONE] Mineral survey completed successfully! Outputs available in {cfg.OUT}")
    return summary


def _render_minerals_map(index: np.ndarray, classes: np.ndarray, hs: np.ndarray, candidates: list[dict]):
    """Render high-resolution classified mineral prospectivity map."""
    fig, ax = plt.subplots(figsize=(10, 10), dpi=cfg.MAP_DPI)

    colors = ["#1f77b4", "#4575b4", "#74add1", "#fee090", "#f46d43", "#d73027", "#7f7f7f"]
    cmap = ListedColormap(colors)

    void = classes == NODATA_CLASS
    shaded = paint_zones(classes, cmap, hs)

    ax.imshow(shaded, extent=[0, cfg.WIDTH * cfg.CELL / 1000, 0, cfg.HEIGHT * cfg.CELL / 1000])

    tx_km = cfg.TARGET_COL * cfg.CELL / 1000
    ty_km = (cfg.HEIGHT - cfg.TARGET_ROW) * cfg.CELL / 1000
    ax.scatter(tx_km, ty_km, marker="*", s=220, color="yellow", edgecolors="black", linewidths=1.5, zorder=10, label="Client Property")

    for cand in candidates:
        cx_km = cand["col"] * cfg.CELL / 1000
        cy_km = (cfg.HEIGHT - cand["row"]) * cfg.CELL / 1000
        ax.scatter(cx_km, cy_km, marker="^", s=130, color="magenta", edgecolors="black", linewidths=1.2, zorder=9)
        ax.annotate(f"#{cand['rank']}", (cx_km + 0.3, cy_km + 0.3), fontsize=9, fontweight="bold", color="black",
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="black", alpha=0.85), zorder=11)

    ax.set_title(f"Mineral Prospectivity Zones (Multi-Commodity Exploration) — {cfg.CLIENT}\nTarget: {cfg.TARGET_LAT:.4f}°S, {cfg.TARGET_LON:.4f}°E", fontsize=11, color=cfg.BRAND_COLOR, pad=12)
    ax.set_xlabel("Easting (km)", fontsize=10)
    ax.set_ylabel("Northing (km)", fontsize=10)

    legend_elements = [
        Patch(facecolor="#d73027", edgecolor="k", label="Very High Prospectivity"),
        Patch(facecolor="#f46d43", edgecolor="k", label="High Prospectivity"),
        Patch(facecolor="#fee090", edgecolor="k", label="Moderate"),
        Patch(facecolor="#74add1", edgecolor="k", label="Low"),
        Patch(facecolor="#4575b4", edgecolor="k", label="Very Low"),
        Patch(facecolor="#7f7f7f", edgecolor="k", label="Built-up (Excluded)"),
        Patch(facecolor="#1f77b4", edgecolor="k", label="Water Body"),
    ]
    if void.any():
        legend_elements.append(Patch(facecolor=NODATA_RGB, edgecolor="k", label="No satellite coverage"))
    ax.legend(handles=legend_elements, loc="lower right", framealpha=0.9, fontsize=8)

    plt.tight_layout()
    safe_savefig(fig, cfg.OUT / "mineral_prospectivity_map.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    gc.collect()


def _render_minerals_evidence(lin, inter, iron, hyd, fer, relief, endow):
    """Render diagnostic panel of mineral evidence layers."""
    fig, axes = plt.subplots(2, 4, figsize=(14, 7), dpi=cfg.MAP_DPI)
    panels = [
        ("Lineament Density", lin, "plasma"),
        ("Intersection Density", inter, "magma"),
        ("Iron Oxide Residual", iron, "YlOrRd"),
        ("Hydroxyl/Clay Residual", hyd, "copper"),
        ("Ferrous/Mafic Residual", fer, "viridis"),
        ("Relative Relief", relief, "terrain"),
        ("Endowment Context", endow, "Blues"),
    ]

    for ax, (title, arr, cm) in zip(axes.flat[:7], panels):
        im = ax.imshow(arr, cmap=cm)
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.axis("off")
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    axes.flat[7].axis("off")
    plt.suptitle(f"SiteSurveyor AI — Mineral Prospectivity Evidence Layers [{cfg.CLIENT}]", fontsize=13, color=cfg.BRAND_COLOR, y=0.98)
    plt.tight_layout()
    safe_savefig(fig, cfg.OUT / "mineral_evidence_layers.png", dpi=cfg.MAP_DPI)
    plt.close(fig)
    plt.close("all")
    gc.collect()


if __name__ == "__main__":
    run_minerals_survey()
