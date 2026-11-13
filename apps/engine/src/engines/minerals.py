"""
SiteSurveyor AI — Mineral Exploration & Prospectivity Engine (Category 2: MINERALS)
===================================================================================
Generates comprehensive multi-mineral exploration intelligence from Earth Observation:

1. A dominant-mineral map: every cell coloured by the mineral system that scores highest
   there, with labelled field targets and the area each system owns across the survey.
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
import matplotlib.patheffects as patheffects
from matplotlib.colors import ListedColormap
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from matplotlib.transforms import Bbox
import numpy as np
from rasterio.warp import Resampling

from src.utils.classification import (
    CLASS_NAMES,
    MINERAL_TRANSPARENT_CODES,
    NODATA_CLASS,
    NODATA_RGB,
    ZONE_LABELS,
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
    print("[1/6] Loading multi-spectral, terrain and geophysical rasters...")
    dem = warp(cfg.RAW / "dem.tif", 1)
    lc = warp(cfg.RAW / "landcover.tif", 1, resampling=Resampling.nearest)
    alos_hv = warp(cfg.RAW / "alos.tif", 2)

    from src.utils.gravity import load_gravity_layers, source_label
    grav_data = load_gravity_layers()
    print(f"      [Gravimetry] {source_label(grav_data)}")

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

    # Known deposit locations (Golden Quarry Mine: -19.6127 S, 29.9842 E).
    # Only apply local deposit decay when the AOI is within 50 km of Golden Quarry;
    # outside the Gweru greenstone belt, leave endowment as NaN so commodity_index
    # renormalizes over the remaining structural and alteration evidence without
    # inducing a spurious directional gradient toward Zimbabwe.
    from src.utils.raster import lonlat_to_pixel
    gq_row, gq_col = lonlat_to_pixel(29.9842, -19.6127)
    yy, xx = np.indices((cfg.HEIGHT, cfg.WIDTH))
    dist_gq_km = np.hypot(yy - gq_row, xx - gq_col) * cfg.CELL / 1000.0
    if float(np.min(dist_gq_km)) <= 50.0:
        endowment = np.exp(-dist_gq_km / 15.0).astype("float32")  # 15 km decay radius
    else:
        endowment = np.full((cfg.HEIGHT, cfg.WIDTH), np.nan, dtype="float32")
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
    del endowment

    evidence_layers = {
        "lineament_density": norm_lin,
        "lineament_intersections": norm_inter,
        "iron_oxide": norm_iron,
        "hydroxyl_clay": norm_hyd,
        "ferrous_mafic": norm_fer,
        "relative_relief": norm_relief,
        "endowment": norm_endow,
    }
    # Only a raster that declares itself a measured survey may carry weight. A modelled
    # or unverified grid still produces maps and target readouts, but it does not become
    # evidence in a score. bouguer_anomaly is left out even when scored: no commodity
    # weights it, because it still holds the regional trend that residual_gravity removes.
    if grav_data["scoreable"]:
        if grav_data["norm_gradient"] is not None:
            evidence_layers["gravity_gradient"] = grav_data["norm_gradient"]
        if grav_data["norm_residual"] is not None:
            evidence_layers["residual_gravity"] = grav_data["norm_residual"]

    # One rule for all nine systems, gold included. Rescaling this overlay to fill 0-100
    # before handing it to the commodity screen stretched gold roughly 20 points above the
    # other eight on identical evidence, so gold ranked first and read "indicated" on
    # ground whose evidence supports iron ore, or nothing at all.
    gold_index = commodity_screen.commodity_index(evidence_layers, cfg.MINERAL_WEIGHTS)
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

    from src.utils.classification import parcel_mean
    local_mean = parcel_mean(gold_index, tr, tc, half_px=2, excluded_mask=water_mask | builtup_mask)
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
        out = {
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
        if grav_data["active"]:
            out["gravity_source_kind"] = grav_data["source_kind"]
        if grav_data["active"] and grav_data["raw_bouguer"] is not None:
            out["bouguer_anomaly_mgal"] = safe_round(grav_data["raw_bouguer"][row, col], 1)
        if grav_data["active"] and grav_data["residual_bouguer"] is not None:
            out["residual_gravity_mgal"] = safe_round(grav_data["residual_bouguer"][row, col], 1)
        if grav_data["active"] and grav_data["raw_gradient"] is not None:
            out["gravity_gradient_mgal_km"] = safe_round(grav_data["raw_gradient"][row, col], 2)
        if grav_data["active"] and grav_data["zones"] is not None:
            z_code = int(grav_data["zones"][row, col])
            out["gravity_zone_code"] = z_code
            z_name = grav_data["zone_names"].get(z_code)
            if z_name:
                out["gravity_zone_name"] = z_name
        return out

    for cand in candidates:
        cand.update(field_read(cand["row"], cand["col"]))
        notes = [
            f"Cover: {cand['overburden_min_m']}-{cand['overburden_max_m']} m "
            f"({cand['overburden_landform'] or 'landform not resolvable'})",
            f"First test hole: {cand['test_hole_depth_m']} m — {cand['sampling_method']}",
            f"Lineament density percentile: {cand['lineament_density_pct']}",
            f"Elevation: {cand['elevation_m']} m | Slope: {cand['slope_degrees']}°",
        ]
        grav_suffix = "" if grav_data["scoreable"] else f" ({grav_data['source_kind']} field)"
        if cand.get("bouguer_anomaly_mgal") is not None:
            notes.append(f"Bouguer gravity anomaly: {cand['bouguer_anomaly_mgal']} mGal{grav_suffix}")
        if cand.get("residual_gravity_mgal") is not None:
            res_val = cand["residual_gravity_mgal"]
            sign = "+" if res_val > 0 else ""
            z_desc = f" ({cand['gravity_zone_name']})" if cand.get("gravity_zone_name") else ""
            notes.append(f"Residual gravity: {sign}{res_val} mGal{z_desc}{grav_suffix}")
        if cand.get("gravity_gradient_mgal_km") is not None:
            notes.append(f"Gravity horizontal gradient: {cand['gravity_gradient_mgal_km']} mGal/km{grav_suffix}")
        cand["field_notes"] = notes

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
    excluded = water_mask | builtup_mask
    # The map's own raster is gold's entry, so the sheet, the area table and the candidate
    # rows cannot disagree about the same metal.
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

    # The map's own raster. Every cell takes the colour of the system that scores highest
    # there, so the sheet answers "what is this ground for" across all nine rather than
    # ramping one metal. Ground whose best system still reads cold stays grey.
    commodity_zones, commodity_scores = commodity_screen.dominant_zones(
        evidence_layers, water_mask=water_mask, builtup_mask=builtup_mask,
    )
    cell_km2 = (cfg.CELL * cfg.CELL) / 1e6
    commodity_areas = commodity_screen.dominant_area_stats(commodity_zones, commodity_scores, cell_km2)
    target_mineral = commodity_screen.BY_ZONE_CODE.get(int(commodity_zones[tr, tc]))
    target_mineral_score = safe_round(commodity_scores[tr, tc], 1)
    for row in commodity_areas:
        if row["cells"]:
            print(f"      {row['symbol']:9s} owns {row['area_km2']:8.2f} km² "
                  f"({row['share_pct']:5.2f}% of area), peak {row['peak_score']}")

    # Enrich candidates with commodity scores and primary mineral affinity, read by the
    # same rule the area table uses so a target's score for a system is the number that
    # system reports for this cell.
    affinity_fields = ("commodity", "commodity_key", "commodity_symbol", "commodity_score")
    for cand in candidates:
        cr, cc = cand["row"], cand["col"]
        scored: list[tuple[float, commodity_screen.Commodity]] = []
        for comm in commodity_screen.COMMODITIES:
            c_score = commodity_screen.cell_index(evidence_layers, comm.weights, cr, cc)
            cand[f"{comm.key}_score"] = safe_round(c_score, 1) if c_score is not None else None
            if c_score is not None:
                scored.append((c_score, comm))
        scored.sort(key=lambda pair: pair[0], reverse=True)

        for prefix in ("primary", "secondary"):
            for suffix in affinity_fields:
                cand[f"{prefix}_{suffix}"] = None
        # The runner-up is on the map label too: a cell that reads Au 71 / Fe 69 is a
        # different decision from one that reads Au 71 / Fe 40, and the dot alone cannot say.
        for prefix, (score, comm) in zip(("primary", "secondary"), scored):
            cand[f"{prefix}_commodity"] = comm.name
            cand[f"{prefix}_commodity_key"] = comm.key
            cand[f"{prefix}_commodity_symbol"] = comm.symbol
            cand[f"{prefix}_commodity_score"] = safe_round(score, 1)
        cand["indicated_minerals"] = ", ".join(indicated) if indicated else "None indicated"

        affinity = (
            f"{cand['primary_commodity']} ({cand['primary_commodity_score']}/100)"
            if cand["primary_commodity"] else "not resolvable at this cell"
        )
        notes = [f"Primary mineral affinity: {affinity}"]
        if cand["secondary_commodity"]:
            notes.append(
                f"Second mineral affinity: {cand['secondary_commodity']} "
                f"({cand['secondary_commodity_score']}/100)"
            )
        notes.append(f"Indicated minerals in area: {cand['indicated_minerals']}")
        cand["field_notes"][0:0] = notes

    # Snapshot the target before the layers it is read from are released
    target_fields = field_read(tr, tc)
    del dem, lc, slope, cover_low, cover_high, cover_band
    gc.collect()

    # 6. Export outputs
    print("[6/6] Exporting GeoTIFFs, vectors, maps, and JSON summary...")
    write_raster(cfg.OUT / "mineral_commodity_zones.tif", commodity_zones, dtype="uint8",
                 nodata=NODATA_CLASS, colors=ZONE_PALETTES["minerals"])
    write_raster(cfg.OUT / "mineral_commodity_index.tif", commodity_scores, dtype="float32", nodata=np.nan)
    export_classified_overlay(
        commodity_zones,
        cfg.OUT / "minerals_overlay.png",
        colors=ZONE_PALETTES["minerals"],
        transparent_codes=MINERAL_TRANSPARENT_CODES,
    )
    if grav_data["active"] and grav_data["zones"] is not None:
        from src.utils.gravity import GRAVITY_ZONE_PALETTE
        write_raster(
            cfg.OUT / "gravity_density_zones.tif",
            grav_data["zones"],
            dtype="uint8",
            nodata=0,
            colors=GRAVITY_ZONE_PALETTE,
        )
    if grav_data["active"] and grav_data["residual_bouguer"] is not None:
        write_raster(
            cfg.OUT / "gravity_residual_anomaly.tif",
            grav_data["residual_bouguer"],
            dtype="float32",
            nodata=np.nan,
        )

    # Candidate CSV with commodity breakdown
    candidate_fields = [
        "rank", "latitude", "longitude", "potential_score", "class_name",
        "primary_commodity", "primary_commodity_symbol", "primary_commodity_score",
        "secondary_commodity", "secondary_commodity_symbol", "secondary_commodity_score",
        "indicated_minerals",
        "distance_from_target_km", "elevation_m", "slope_degrees",
        "overburden_min_m", "overburden_max_m", "overburden_landform",
        "test_hole_depth_m", "sampling_method", "landcover",
        "gold_score", "base_metals_score", "lithium_score", "nickel_pgm_score",
        "iron_ore_score", "chromium_score", "manganese_score", "bauxite_score", "rare_earths_score",
        "lineament_density_pct", "intersection_density_pct",
        "iron_oxide_residual_pct", "hydroxyl_clay_residual_pct",
        "ferrous_mafic_pct", "relative_relief_pct", "endowment_context_pct",
        "bouguer_anomaly_mgal", "residual_gravity_mgal", "gravity_gradient_mgal_km", "gravity_zone_name",
        "gravity_source_kind",
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
        "dominant_mineral_map": {
            "score_threshold": commodity_screen.INDICATED_P90,
            "area_by_mineral": commodity_areas,
        },
        "unscreenable": commodity_screen.unscreened_payload(),
        "excluded_classes": ["open water", "built-up ground"],
    }
    (cfg.OUT / "mineral_commodities.json").write_text(json.dumps(commodity_payload, indent=2))

    from src.utils.export import export_candidates_kml, export_kmz, export_mineral_commodities_csv
    export_mineral_commodities_csv(ranked_commodities, cfg.OUT / "mineral_commodities.csv")

    # Area statistics for the prospectivity ramp the field targets were picked on.
    area_stats = {}
    for code, name in class_names.items():
        count = int(np.sum(classes == code))
        area_stats[name] = {
            "area_km2": round(count * cell_km2, 2),
            "percentage": round(count / (cfg.WIDTH * cfg.HEIGHT) * 100.0, 1),
        }

    # Maps
    _render_minerals_map(commodity_zones, commodity_scores, hs, candidates, commodity_areas, ranked_commodities)
    _render_minerals_evidence(norm_lin, norm_inter, norm_iron, norm_hyd, norm_fer, norm_relief, norm_endow)
    del gold_index, classes, hs, commodity_zones, commodity_scores
    del norm_lin, norm_inter, norm_iron, norm_hyd, norm_fer, norm_relief, norm_endow
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
            "dominant_mineral": target_mineral.name if target_mineral else None,
            "dominant_mineral_symbol": target_mineral.symbol if target_mineral else None,
            "dominant_mineral_score": target_mineral_score,
            **target_fields,
        },
        "model_weights": cfg.MINERAL_WEIGHTS,
        "screening_depth_model": depth.overburden_basis(),
        "natural_breaks": [round(float(b), 1) for b in breaks],
        "class_area_distribution": area_stats,
        "commodity_area_distribution": commodity_areas,
        "candidate_targets": candidates,
        "mineral_commodities": ranked_commodities,
        "indicated_commodities": indicated,
        "unscreenable_commodities": commodity_screen.unscreened_payload(),
    }
    from src.utils.provenance import capture_provenance, gravity_fingerprint
    summary["provenance"] = capture_provenance(
        "minerals", ["dem.tif", "landcover.tif", "alos.tif", "optical.tif"]
    )
    summary["provenance"]["gravimetry"] = {
        "active": bool(grav_data["active"]),
        "source": grav_data["source_file"] or "None (structural/spectral baseline)",
        "kind": grav_data["source_kind"],
        "citation": grav_data["source_citation"] or None,
        "scored": bool(grav_data["scoreable"]),
        "label": source_label(grav_data),
        "input": gravity_fingerprint(),
        "method": (
            "Regional-residual polynomial separation (2nd order), horizontal gradient magnitude "
            f"& 5-tier density zonation, interpolated from the source posting onto the {cfg.CELL:g} m "
            "analysis grid rather than observed at that resolution"
            if grav_data["active"]
            else "None"
        ),
        "residual_range_mgal": [
            safe_round(float(np.nanmin(grav_data["residual_bouguer"])), 1),
            safe_round(float(np.nanmax(grav_data["residual_bouguer"])), 1),
        ] if grav_data["active"] and grav_data["residual_bouguer"] is not None else None,
        "gradient_range_mgal_km": [
            safe_round(float(np.nanmin(grav_data["raw_gradient"])), 2),
            safe_round(float(np.nanmax(grav_data["raw_gradient"])), 2),
        ] if grav_data["active"] and grav_data["raw_gradient"] is not None else None,
        "zones": grav_data.get("zone_names") if grav_data["active"] else None,
    }
    # The dashboard reads data_sources and nothing else from the provenance tree, so the
    # gravity declaration travels here or a modelled field reaches the page unlabelled.
    summary["provenance"]["data_sources"]["fixed"]["gravimetry"] = source_label(grav_data)
    (cfg.OUT / "mineral_summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False))

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


def _box_overlap(a, b) -> float:
    """Intersection area of two display-coordinate boxes, zero when they miss."""
    w = min(a.x1, b.x1) - max(a.x0, b.x0)
    h = min(a.y1, b.y1) - max(a.y0, b.y0)
    return w * h if w > 0 and h > 0 else 0.0


def _render_minerals_map(
    zones: np.ndarray,
    scores: np.ndarray,
    hs: np.ndarray,
    candidates: list[dict],
    area_rows: list[dict],
    ranked: list[dict],
) -> None:
    """The dominant-mineral sheet: every system on one map, with the figures to act on it.

    A cell takes the colour of the mineral system that scores highest there, and only where
    that score reaches the indicated threshold — cold ground stays grey rather than borrowing
    the colour of a winner nobody should walk to. Each target is labelled with its two
    strongest systems and the cover/test-hole figures a crew needs, and the legend carries the
    area each system owns so the reader can weigh a high score against how much ground supports it.
    """
    palette = ZONE_PALETTES["minerals"]
    labels = ZONE_LABELS["minerals"]
    cmap = ListedColormap(palette)
    indicated = {item["key"] for item in ranked if item["indicated"]}

    width_km = cfg.WIDTH * cfg.CELL / 1000.0
    height_km = cfg.HEIGHT * cfg.CELL / 1000.0

    fig = plt.figure(figsize=(15, 10), dpi=cfg.MAP_DPI)
    ax = fig.add_axes([0.065, 0.13, 0.575, 0.76])
    ax.imshow(paint_zones(zones, cmap, hs), extent=[0, width_km, 0, height_km])

    # Absolute UTM tick values, not offsets from an origin the reader cannot see: a figure
    # taken off this sheet has to be navigable to the ground it names.
    step = max(1.0, round(max(width_km, height_km) / 6.0))
    ax.set_xticks(np.arange(0, width_km + step, step))
    ax.set_yticks(np.arange(0, height_km + step, step))
    ax.xaxis.set_major_formatter(lambda v, _p: f"{(cfg.XMIN / 1000.0 + v):.0f}")
    ax.yaxis.set_major_formatter(lambda v, _p: f"{(cfg.YMIN / 1000.0 + v):.0f}")
    ax.grid(True, color="white", linewidth=0.7, alpha=0.55)
    ax.set_axisbelow(True)
    ax.set_xlabel(f"Easting (km, EPSG:{cfg.EPSG})", fontsize=9)
    ax.set_ylabel(f"Northing (km, EPSG:{cfg.EPSG})", fontsize=9)
    ax.tick_params(labelsize=8)
    ax.set_xlim(0, width_km)
    ax.set_ylim(0, height_km)

    halo = [patheffects.withStroke(linewidth=2.6, foreground="white")]

    tx_km = cfg.TARGET_COL * cfg.CELL / 1000.0
    ty_km = (cfg.HEIGHT - cfg.TARGET_ROW) * cfg.CELL / 1000.0
    ax.scatter(tx_km, ty_km, marker="*", s=260, color="#ffe600", edgecolors="black",
               linewidths=1.4, zorder=10)
    target_code = int(zones[cfg.TARGET_ROW, cfg.TARGET_COL])
    target_mineral = commodity_screen.BY_ZONE_CODE.get(target_code)
    target_score = float(scores[cfg.TARGET_ROW, cfg.TARGET_COL])
    if target_mineral and np.isfinite(target_score):
        target_text = f"Client property — {target_mineral.symbol} {target_score:.1f}"
    else:
        target_text = "Client property — no system above threshold"
    annotations = [ax.annotate(
        target_text, xy=(tx_km, ty_km), xytext=(12, -16), textcoords="offset points",
        fontsize=8.5, fontweight="bold", color="black", zorder=12, path_effects=halo,
        arrowprops=dict(arrowstyle="-", lw=0.8, color="#111111", shrinkA=5, shrinkB=3),
    )]

    for cand in candidates:
        cx_km = cand["col"] * cfg.CELL / 1000.0
        cy_km = (cfg.HEIGHT - cand["row"]) * cfg.CELL / 1000.0
        mineral = commodity_screen.BY_KEY.get(cand.get("primary_commodity_key"))
        ax.scatter(cx_km, cy_km, marker="^", s=140,
                   color=mineral.color if mineral else "#ff00ff",
                   edgecolors="black", linewidths=1.2, zorder=9)

        reads = []
        for prefix in ("primary", "secondary"):
            symbol = cand.get(f"{prefix}_commodity_symbol")
            score = cand.get(f"{prefix}_commodity_score")
            if symbol and score is not None:
                reads.append(f"{symbol} {score:.1f}")
        cover = (
            f"cover {cand['overburden_min_m']:g}–{cand['overburden_max_m']:g} m"
            if cand.get("overburden_min_m") is not None else "cover not resolvable"
        )
        hole = (
            f"hole {cand['test_hole_depth_m']:g} m"
            if cand.get("test_hole_depth_m") is not None else "hole n/a"
        )
        label = f"#{cand['rank']}  {' · '.join(reads) or 'not resolvable'}\n{cover} · {hole}"
        annotations.append(ax.annotate(
            label, xy=(cx_km, cy_km), xytext=(34, 24), textcoords="offset points",
            ha="left", va="center", fontsize=8, fontweight="bold",
            color="#111111", zorder=12, path_effects=halo, linespacing=1.35,
            arrowprops=dict(arrowstyle="-", lw=0.8, color="#111111", shrinkA=5, shrinkB=3),
        ))

    # A cluster of targets is exactly where the reader must tell them apart, so each label
    # takes the first offset that covers no label already placed, no star and no sheet edge.
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    axes_bb = ax.get_window_extent(renderer)
    # A scatter's window extent is null until its own draw pass, so reserve the star from
    # its data position and marker size instead of asking the collection for a box.
    sx, sy = ax.transData.transform((tx_km, ty_km))
    pad = 12.0 * fig.dpi / 72.0
    reserved = [Bbox.from_extents(sx - pad, sy - pad, sx + pad, sy + pad)]
    offsets = [
        (30, 16, "left", "bottom"), (30, -16, "left", "top"),
        (-30, 16, "right", "bottom"), (-30, -16, "right", "top"),
        (0, 28, "center", "bottom"), (0, -28, "center", "top"),
        (58, 34, "left", "bottom"), (58, -34, "left", "top"),
        (-58, 34, "right", "bottom"), (-58, -34, "right", "top"),
        (0, 56, "center", "bottom"), (0, -56, "center", "top"),
        (86, 12, "left", "bottom"), (86, -12, "left", "top"),
        (-86, 12, "right", "bottom"), (-86, -12, "right", "top"),
        (24, 48, "left", "bottom"), (-24, -48, "right", "top"),
    ]
    for ann in annotations:
        best, best_cost = None, None
        for dx, dy, ha, va in offsets:
            ann.xyann = (dx, dy)
            ann.set_ha(ha)
            ann.set_va(va)
            bb = ann.get_window_extent(renderer)
            cost = sum(_box_overlap(bb, box) for box in reserved)
            cost += 40.0 * (
                max(0.0, axes_bb.x0 - bb.x0) + max(0.0, bb.x1 - axes_bb.x1)
                + max(0.0, axes_bb.y0 - bb.y0) + max(0.0, bb.y1 - axes_bb.y1)
            )
            if best_cost is None or cost < best_cost:
                best, best_cost = (dx, dy, ha, va, bb), cost
            if cost == 0.0:
                break
        ann.xyann = best[0], best[1]
        ann.set_ha(best[2])
        ann.set_va(best[3])
        reserved.append(best[4].expanded(1.04, 1.12))

    # Scale bar and north arrow, drawn in data coordinates so they stay true to the grid.
    bar_km = max(1.0, round(width_km / 5.0))
    bx, by = width_km * 0.03, height_km * 0.035
    ax.plot([bx, bx + bar_km], [by, by], color="black", lw=3, solid_capstyle="butt", zorder=12)
    ax.plot([bx, bx], [by, by + height_km * 0.012], color="black", lw=2, zorder=12)
    ax.plot([bx + bar_km, bx + bar_km], [by, by + height_km * 0.012], color="black", lw=2, zorder=12)
    ax.text(bx + bar_km / 2, by + height_km * 0.022, f"{bar_km:.0f} km", ha="center", va="bottom",
            fontsize=8.5, fontweight="bold", color="black", zorder=12, path_effects=halo)
    nx, ny = width_km * 0.955, height_km * 0.90
    ax.annotate("", xy=(nx, ny + height_km * 0.06), xytext=(nx, ny),
                arrowprops=dict(arrowstyle="-|>", lw=1.8, color="black"), zorder=12)
    ax.text(nx, ny + height_km * 0.075, "N", ha="center", va="bottom", fontsize=10,
            fontweight="bold", color="black", zorder=12, path_effects=halo)

    ax.set_title(
        f"Mineral Systems Identified — {cfg.CLIENT}\n"
        f"Target {cfg.TARGET_LAT:.4f}°, {cfg.TARGET_LON:.4f}° · {width_km:.1f} × {height_km:.1f} km "
        f"({width_km * height_km:.0f} km²) · {cfg.CELL} m cells",
        fontsize=12, color=cfg.BRAND_COLOR, pad=12,
    )

    handles = []
    for row in area_rows:
        flag = "indicated" if row["key"] in indicated else "not indicated"
        peak = f"peak {row['peak_score']:.1f}" if row["peak_score"] is not None else "no scored cell"
        share = f"{row['share_pct']:.1f}" if row["share_pct"] >= 0.05 else "<0.1"
        handles.append(Patch(
            facecolor=row["color"], edgecolor="k",
            label=f"{row['name']} ({row['symbol']})\n"
                  f"{row['area_km2']:.2f} km² · {share}% of area · {peak} · {flag}",
        ))
    for code in (commodity_screen.ZONE_WATER, commodity_screen.ZONE_BELOW_THRESHOLD,
                 commodity_screen.ZONE_BUILTUP):
        count = int(np.count_nonzero(zones == code))
        handles.append(Patch(
            facecolor=palette[code], edgecolor="k",
            label=f"{labels[code]} · {count * (cfg.CELL ** 2) / 1e6:.2f} km²",
        ))
    if np.any(zones == NODATA_CLASS):
        handles.append(Patch(facecolor=NODATA_RGB, edgecolor="k", label="No satellite coverage"))
    handles.append(Line2D([], [], marker="*", color="none", markerfacecolor="#ffe600",
                          markeredgecolor="black", markersize=14, label="Client property"))
    handles.append(Line2D([], [], marker="^", color="none", markerfacecolor="white",
                          markeredgecolor="black", markersize=10,
                          label="Field target — fill = strongest system at that cell"))
    ax.legend(handles=handles, loc="center left", bbox_to_anchor=(1.03, 0.5),
              framealpha=0.95, fontsize=7.5, labelspacing=0.75, borderpad=0.8,
              title="Mineral system · area it owns · strongest cell", title_fontsize=8.5)

    fig.text(
        0.065, 0.045,
        f"Colour = the mineral system scoring highest at that cell, shown only where it reaches "
        f"{commodity_screen.INDICATED_P90:.0f}/100. Scores are percentiles within this survey area, "
        "not grades or tonnages; cover and test-hole depths are DEM estimates to first ground, not ore depth.",
        fontsize=7.5, color="#444444", va="bottom", wrap=True,
    )
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
        im = ax.imshow(arr, cmap=cm, vmin=0.0, vmax=1.0)
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
