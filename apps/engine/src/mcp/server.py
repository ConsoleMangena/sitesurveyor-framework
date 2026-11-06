"""
SiteSurveyor AI — Model Context Protocol (MCP) Server
=====================================================
Autonomous satellite-derived geospatial intelligence server for AI agents.
Enables agents (Claude, Gemini, Cursor, ChatGPT, etc.) to trigger multi-criteria
satellite screening for any GPS coordinate across:
  - Category 1: Groundwater potential & prioritised borehole siting
  - Category 2: Shear-zone gold prospectivity & hydrothermal alteration
  - Category 3: Soil & agricultural capability, erosion risk
  - Category 5: Multi-hazard & site safety screening

Usage:
  python -m src.mcp.server                        # stdio transport (local agents)
  python -m src.mcp.server --transport sse --port 8000  # SSE transport (cloud / remote)
"""
from __future__ import annotations

import argparse
import functools
import gc
import json
import os
import sys
import threading
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Always import config first to configure PROJ paths before rasterio loads
import src.config as cfg

from mcp.server.mcpserver import MCPServer

# Initialize MCP Server
mcp = MCPServer(
    name="SiteSurveyorAI",
    title="SiteSurveyor AI — Satellite Geospatial Intelligence Engine",
    description=(
        "Autonomous multi-sensor satellite Earth observation intelligence engine. "
        "Provides probabilistic groundwater potential, mineral prospectivity, soil capability, "
        "and natural hazard safety screening from orbital data (Sentinel-2, DEM 30m, ALOS PALSAR, Landsat WOfS)."
    ),
    version="2.0.0",
)


# The category candidate lists live in the dossier; surfacing them from the survey tool
# is what lets a client render the ranked sites instead of re-reading the JSON file.
_CANDIDATE_KEYS = {
    "water": "candidate_sites",
    "minerals": "candidate_targets",
    "soil_land": "candidate_areas",
    "hazard_safety": "safest_candidate_sites",
}


def _candidate_lists(dossier: dict, limit: int = 6) -> dict[str, list]:
    categories = dossier.get("categories", {}) if isinstance(dossier, dict) else {}
    out: dict[str, list] = {}
    for category, key in _CANDIDATE_KEYS.items():
        data = categories.get(category) or {}
        candidates = data.get(key) or []
        out[category] = candidates[:limit]
    return out


def _ensure_data_present(required: list[str] | None = None):
    """Verify that required satellite layers exist; fetch from DE Africa if missing."""
    if required is None:
        required = ["dem.tif", "landcover.tif", "alos.tif", "optical.tif", "wofs.tif", "rain_mean.tif"]
    from src.fetch_data import ensure_raw
    ensure_raw(required)


def _cached_summary(path: Path, latitude: float, longitude: float) -> dict | None:
    """Return a stored survey only when it covers this point, saying why it was skipped.

    Silently swallowing a corrupt summary made the agent pay for a full re-survey with no
    clue that one was available, and treated "unreadable" exactly like "never run".
    """
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            cached = json.load(f)
    except Exception as e:
        print(f"[cache] {path.name} unreadable -- re-running survey: {type(e).__name__}: {e}")
        return None
    if not isinstance(cached, dict):
        print(f"[cache] {path.name} is a {type(cached).__name__}, not an object -- re-running survey")
        return None

    # soil_summary.json uses flat target_lat/target_lon; the others nest coordinates.
    tc = cached.get("target_coordinates") or {
        "latitude": cached.get("target_lat"),
        "longitude": cached.get("target_lon"),
    }
    lat, lon = tc.get("latitude"), tc.get("longitude")
    if lat is None or lon is None:
        print(f"[cache] {path.name} records no target coordinates -- re-running survey")
        return None
    if abs(float(lat) - latitude) > 0.001 or abs(float(lon) - longitude) > 0.001:
        print(f"[cache] {path.name} is for ({lat:.5f}, {lon:.5f}), not ({latitude:.5f}, {longitude:.5f})")
        return None

    # A cached score is only honest while the coverages behind it are the selected ones.
    from src.fetch_data import stale_layers
    stale = stale_layers()
    if stale:
        print(f"[cache] {path.name} was computed from another coverage than the selection "
              f"({', '.join(stale)} differ) -- re-running survey")
        return None

    # One category refetching a layer leaves every other summary scored from the raster it
    # replaced, and the selection alone cannot show that -- the file mtimes can.
    newer = [p.name for p in (cfg.RAW / f"{spec['layer']}.tif" for spec in cfg.DATA_SOURCES.values())
             if p.exists() and p.stat().st_mtime > path.stat().st_mtime]
    if newer:
        print(f"[cache] {path.name} predates the {' and '.join(newer)} on disk -- re-running survey")
        return None
    return cached


# ============================================================================
# MCP Tools
# ============================================================================

# Reentrant: the REST layer configures the AOI and then calls the tool, so the same
# thread takes this lock twice. A plain Lock deadlocked the second acquisition.
_SITE_LOCK = threading.RLock()

_progress_state = threading.local()


def set_progress_callback(callback) -> None:
    """Register a per-thread stage reporter, or None to clear it.

    Thread-local so a background job's progress cannot leak into a stdio MCP session
    sharing the process, and optional so every existing caller is unaffected.
    """
    _progress_state.callback = callback


def _report_progress(stage: str, percent: int) -> None:
    callback = getattr(_progress_state, "callback", None)
    if callback is None:
        return
    try:
        callback(stage, percent)
    except Exception:
        # A progress reporter is observability, not analysis: it must never be able to
        # fail a survey that is otherwise running correctly.
        pass


def _single_site(fn):
    """Let one site be under analysis per process.

    The engines read bbox, grid size, cell pitch and target pixel from module-global
    src.config, which every tool mutates via set_target_site. REST handlers now run in a
    threadpool so /health keeps answering, which means two surveys genuinely overlap
    unless something serializes them -- each would analyze the other's AOI and publish
    plausible numbers for the wrong place. Drop this when an immutable per-job
    SiteContext replaces those globals.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with _SITE_LOCK:
            return fn(*args, **kwargs)
    return wrapper

@mcp.tool()
@_single_site
def survey_site(
    latitude: float,
    longitude: float,
    categories: list[str] = ["all"],
    client_name: str = "Client",
    address: str = "",
    half_deg: float = 0.08,
) -> dict:
    """
    Execute a comprehensive satellite screening survey across requested categories.

    Args:
        latitude: Target property GPS latitude in decimal degrees (e.g. -19.50487)
        longitude: Target property GPS longitude in decimal degrees (e.g. 29.84598)
        categories: List of categories to analyze: 'water', 'minerals', 'soil', 'hazard', or 'all'.
        client_name: Name of client or project for report attribution.
        address: Property address or location description printed on the dossier.

    Returns:
        Structured intelligence dictionary with multi-criteria scores, ranked candidate
        lists, primary GPS recommendations, and paths to maps, KMZ vectors, and the
        executive HTML dossier.
    """
    cfg.set_target_site(latitude, longitude, half_deg=half_deg, client=client_name, address=address or None)
    _report_progress("Acquiring satellite layers", 6)
    _ensure_data_present()

    cats = [c.lower().strip() for c in categories]
    run_all = "all" in cats
    _report_progress("Running survey categories", 15)

    results = {}
    stages = [
        ("water", "Groundwater potential & borehole siting", 20, 45),
        ("minerals", "Mineral prospectivity & structure", 45, 62),
        ("soil", "Soil capability & erosion risk", 62, 78),
        ("hazard", "Hazard exposure & safe siting", 78, 90),
    ]
    for key, label, start_pct, end_pct in stages:
        if not (run_all or key in cats):
            continue
        _report_progress(label, start_pct)
        if key == "water":
            from src.engines.water import run_water_survey
            results["water"] = run_water_survey()
        elif key == "minerals":
            from src.engines.minerals import run_minerals_survey
            results["minerals"] = run_minerals_survey()
        elif key == "soil":
            from src.engines.soil import run_soil_survey
            results["soil"] = run_soil_survey()
        elif key == "hazard":
            from src.engines.hazard import run_hazard_survey
            results["hazard"] = run_hazard_survey()
        _report_progress(label, end_pct)
        gc.collect()

    # Generate or refresh Master Executive Dossier
    _report_progress("Building executive dossier", 92)
    from src.report import generate_site_dossier
    dossier = generate_site_dossier()
    scorecard = dossier.get("executive_scorecard", {})

    gw = scorecard.get("groundwater", {})
    minerals = scorecard.get("minerals", {})
    soil = scorecard.get("soil_land", {})
    haz = scorecard.get("hazard_safety", {})

    return {
        "status": "success",
        "executive_summary": (
            f"Survey completed for ({latitude:.5f}, {longitude:.5f}). "
            f"Groundwater potential is {gw.get('cell_score', 'N/A')}/100 ({gw.get('cell_class', 'N/A')}) "
            f"with top borehole site {gw.get('primary_borehole_candidate', {}).get('distance_km', 'N/A')} km away. "
            f"Mineral prospectivity is {minerals.get('cell_score', 'N/A')}/100 ({minerals.get('cell_class', 'N/A')}). "
            f"Soil capability is {soil.get('cell_score', 'N/A')}/100 ({soil.get('cell_class', 'N/A')}). "
            f"Site safety score is {haz.get('safety_score', 'N/A')}/100 with hazard index {haz.get('hazard_score', 'N/A')}/100."
        ),
        "scores": {
            "groundwater": {
                "cell_score": gw.get("cell_score"),
                "cell_class": gw.get("cell_class"),
                "parcel_150m_mean": gw.get("parcel_150m_score"),
            },
            "minerals": {
                "cell_score": minerals.get("cell_score"),
                "cell_class": minerals.get("cell_class"),
                "parcel_150m_mean": minerals.get("parcel_150m_score"),
            },
            "soil_land": {
                "cell_score": soil.get("cell_score"),
                "cell_class": soil.get("cell_class"),
                "parcel_150m_mean": soil.get("parcel_150m_score"),
            },
            "hazard_safety": {
                "safety_score": haz.get("safety_score"),
                "hazard_score": haz.get("hazard_score"),
                "hazard_class": haz.get("hazard_class"),
            },
        },
        "candidates": _candidate_lists(dossier),
        "primary_recommendations": {
            "top_borehole_drilling_site": gw.get("primary_borehole_candidate"),
            "top_mineral_exploration_target": minerals.get("primary_mineral_target"),
            "top_agricultural_zone": soil.get("primary_agricultural_zone"),
            "safest_building_site": haz.get("primary_safe_build_site"),
        },
        # A caller must be able to tell whether a 61.4 is comparable to another site's
        # 61.4. It is not: the index is a percentile rank inside this AOI only.
        "score_basis": "relative_to_aoi_percentile",
        "claim_ceiling": (
            "Prioritisation of investigation sites only. Not a statement of water yield, "
            "mineral grade, or buildability. Ground truthing is required before capital spend."
        ),
        "deliverables": {
            "master_json_dossier": str(cfg.OUT / "master_site_dossier.json"),
            "maps": {
                "groundwater_map": str(cfg.OUT / "groundwater_potential_map.png"),
                "mineral_prospectivity_map": str(cfg.OUT / "mineral_prospectivity_map.png"),
                "soil_capability_map": str(cfg.OUT / "soil_capability_map.png"),
                "hazard_risk_map": str(cfg.OUT / "hazard_risk_map.png"),
            },
            "mobile_gps_kmz": {
                "boreholes": str(cfg.OUT / "candidate_borehole_sites.kmz"),
                "minerals": str(cfg.OUT / "candidate_mineral_targets.kmz"),
                "soil_zones": str(cfg.OUT / "candidate_land_zones.kmz"),
                "safe_sites": str(cfg.OUT / "safest_buildable_sites.kmz"),
            },
        },
    }


@mcp.tool()
@_single_site
def get_boreholes(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """
    Retrieve ranked borehole investigation coordinates for a given location.

    These are prioritisation targets from a 30 m satellite screening grid, not survey-grade
    drill positions: the output states its own uncertainty and expects VES/ERT confirmation.

    Args:
        latitude: Target property GPS latitude in decimal degrees.
        longitude: Target property GPS longitude in decimal degrees.
        top_k: Number of ranked candidate borehole sites to return (default: 5).

    Returns:
        Dictionary containing target property potential, the estimated wet- and dry-season depth to
        water at the target and at each ranked site, ranked candidate sites with GPS coordinates,
        proximity distance, score, and recommended geophysical verification steps (VES/ERT).
    """
    cfg.set_target_site(latitude, longitude)
    data = _cached_summary(cfg.OUT / "summary.json", latitude, longitude)
    if data is None:
        _ensure_data_present()
        from src.engines.water import run_water_survey
        data = run_water_survey(latitude, longitude)

    candidates = data.get("candidate_sites", [])[:top_k]
    target_info = data.get("target_assessment", {})
    first = candidates[0] if candidates else {}
    wet, dry = first.get("depth_to_water_wet_m"), first.get("depth_to_water_dry_m")
    depth_advice = ""
    if wet is not None and dry is not None:
        depth_advice = (f" Expected water table at Candidate #{first.get('rank', 1)} is "
                        f"{wet}-{dry} m below surface, which reads as "
                        f"{first.get('borehole_read') or 'a rig-drilled hole'}. That range is "
                        "estimated from the terrain, not measured, so the sounding decides.")

    return {
        "target_coordinates": {"latitude": latitude, "longitude": longitude},
        "target_groundwater_potential": {
            "cell_score": target_info.get("coordinate_cell_score"),
            "cell_class": target_info.get("coordinate_cell_class"),
            "parcel_150m_mean": target_info.get("parcel_mean_150m"),
            "twi": target_info.get("twi"),
            "slope_degrees": target_info.get("slope_degrees"),
            "depth_to_water_wet_m": target_info.get("depth_to_water_wet_m"),
            "depth_to_water_dry_m": target_info.get("depth_to_water_dry_m"),
            "height_above_channel_m": target_info.get("height_above_channel_m"),
        },
        "ranked_candidates": candidates,
        "screening_depth_model": data.get("screening_depth_model"),
        "advisory": (
            "Screening-level satellite analysis. Recommended next step: Perform Vertical Electrical Sounding (VES) "
            "resistivity sounding at Candidate #1 to confirm depth to aquifer and fracture permeability."
        ) + ((" " + depth_advice) if depth_advice else ""),
        "kmz_mobile_gps_file": str(cfg.OUT / "candidate_borehole_sites.kmz"),
    }


@mcp.tool()
@_single_site
def get_minerals(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """
    Screen shear-zone gold prospectivity and hydrothermal alteration around a site.

    Args:
        latitude: Target GPS latitude.
        longitude: Target GPS longitude.
        top_k: Number of exploration targets to return (default: 5).

    Returns:
        Dictionary with mineral prospectivity scores, lineament structural context,
        alteration indicators (iron oxide, gossan, hydroxyl clay), and ranked targets.
    """
    cfg.set_target_site(latitude, longitude)
    data = _cached_summary(cfg.OUT / "mineral_summary.json", latitude, longitude)
    if data is None:
        _ensure_data_present(["dem.tif", "landcover.tif", "alos.tif", "optical.tif"])
        from src.engines.minerals import run_minerals_survey
        data = run_minerals_survey(latitude, longitude)

    targets = data.get("candidate_targets", [])[:top_k]
    target_info = data.get("target_assessment", {})
    first = targets[0] if targets else {}
    cover_low, cover_high = first.get("overburden_min_m"), first.get("overburden_max_m")
    cover_advice = ""
    if cover_low is not None and cover_high is not None:
        cover_advice = (f" Expected cover at Target #{first.get('rank', 1)} is {cover_low}-{cover_high} m "
                        f"({first.get('overburden_landform') or 'landform not resolvable'}), so the first "
                        f"test hole goes to {first.get('test_hole_depth_m')} m with a "
                        f"{first.get('sampling_method') or 'truck-mounted auger rig'}. That is cover to "
                        "fresh rock estimated from the terrain, not ore depth.")

    return {
        "target_coordinates": {"latitude": latitude, "longitude": longitude},
        "target_prospectivity": {
            "cell_score": target_info.get("coordinate_cell_score"),
            "cell_class": target_info.get("coordinate_cell_class"),
            "parcel_150m_mean": target_info.get("parcel_mean_150m"),
            "overburden_min_m": target_info.get("overburden_min_m"),
            "overburden_max_m": target_info.get("overburden_max_m"),
            "test_hole_depth_m": target_info.get("test_hole_depth_m"),
        },
        "ranked_targets": targets,
        "screening_depth_model": data.get("screening_depth_model"),
        "advisory": (
            "Screening-level satellite analysis. Sample the indicated structural targets on the ground "
            "before any trenching or drilling."
        ) + ((" " + cover_advice) if cover_advice else ""),
        "kmz_mobile_gps_file": str(cfg.OUT / "candidate_mineral_targets.kmz"),
    }


@mcp.tool()
@_single_site
def mineral_exploration(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """Screen shear-zone gold prospectivity (alias for get_minerals)."""
    return get_minerals(latitude=latitude, longitude=longitude, top_k=top_k)


@mcp.tool()
@_single_site
def mineralexploration(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """Screen shear-zone gold prospectivity (alias for get_minerals)."""
    return get_minerals(latitude=latitude, longitude=longitude, top_k=top_k)


@mcp.tool()
@_single_site
def get_soil_capability(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """
    Assess agricultural land capability, soil moisture, and erosion risk.

    Args:
        latitude: Target GPS latitude.
        longitude: Target GPS longitude.
        top_k: Number of prime land zones to return (default: 5).

    Returns:
        Dictionary with Soil Capability Index (SCI), erosion risk, and prime arable land zones.
    """
    cfg.set_target_site(latitude, longitude)
    data = _cached_summary(cfg.OUT / "soil_summary.json", latitude, longitude)
    if data is None:
        _ensure_data_present()
        from src.engines.soil import run_soil_survey
        data = run_soil_survey(latitude, longitude)

    candidates = data.get("candidate_areas", [])[:top_k]

    return {
        "target_coordinates": {"latitude": latitude, "longitude": longitude},
        "target_soil_capability": {
            "cell_score": data.get("target_sci_score"),
            "cell_class": data.get("target_sci_class"),
            "parcel_150m_mean": data.get("local_150m_mean_score"),
            "parcel_class": data.get("local_150m_class"),
        },
        "prime_land_zones": candidates,
        "kmz_mobile_gps_file": str(cfg.OUT / "candidate_land_zones.kmz"),
    }


@mcp.tool()
@_single_site
def get_hazard_safety(latitude: float, longitude: float, top_k: int = 5) -> dict:
    """
    Assess multi-hazard exposure (flood, slope failure, erosion, wildfire, drought) and safest buildable sites.

    Args:
        latitude: Target GPS latitude.
        longitude: Target GPS longitude.
        top_k: Number of safest buildable sites to return (default: 5).

    Returns:
        Dictionary with Site Safety Index (0-100, 100=Safest), detailed hazard breakdown,
        and ranked low-risk buildable locations.
    """
    cfg.set_target_site(latitude, longitude)
    data = _cached_summary(cfg.OUT / "hazard_summary.json", latitude, longitude)
    if data is None:
        _ensure_data_present()
        from src.engines.hazard import run_hazard_survey
        data = run_hazard_survey(latitude, longitude)

    t_assess = data.get("target_assessment", {})
    safest = data.get("safest_candidate_sites", [])[:top_k]

    return {
        "target_coordinates": {"latitude": latitude, "longitude": longitude},
        "safety_assessment": {
            "site_safety_score": t_assess.get("safety_index_score"),
            "hazard_index_score": t_assess.get("hazard_index_score"),
            "hazard_classification": t_assess.get("hazard_classification"),
            "parcel_150m_hazard": t_assess.get("local_150m_mean_hazard"),
            "sub_hazard_breakdown": t_assess.get("sub_hazard_breakdown", {}),
        },
        "safest_candidate_sites": safest,
        "kmz_mobile_gps_file": str(cfg.OUT / "safest_buildable_sites.kmz"),
    }


@mcp.tool()
@_single_site
def get_executive_dossier() -> dict:
    """
    Retrieve the master cross-category site intelligence dossier.

    Returns:
        Consolidated scorecard across all categories, metadata, and the path to the
        JSON dossier on disk.
    """
    dossier_path = cfg.OUT / "master_site_dossier.json"
    if not dossier_path.exists():
        from src.report import generate_site_dossier
        dossier = generate_site_dossier()
    else:
        with open(dossier_path, "r", encoding="utf-8") as f:
            dossier = json.load(f)

    return {
        "title": dossier.get("title"),
        "client": dossier.get("client"),
        "address": dossier.get("address"),
        "generated_at": dossier.get("generated_at"),
        "executive_scorecard": dossier.get("executive_scorecard"),
        "dossier_path": str(dossier_path) if dossier_path.exists() else None,
        "dossier_size_bytes": dossier_path.stat().st_size if dossier_path.exists() else 0,
    }


# ============================================================================
# MCP Resources
# ============================================================================

@mcp.resource("sitesurveyor://reports/master_dossier.json")
def get_master_dossier_resource() -> str:
    """Read the latest Master Site Intelligence JSON dossier."""
    path = cfg.OUT / "master_site_dossier.json"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return json.dumps({"error": "Master dossier not yet generated. Run survey_site first."})


# ============================================================================
# Server Runner
# ============================================================================

def run_server():
    """Parse CLI arguments and run MCP Server over stdio or sse transport."""
    parser = argparse.ArgumentParser(description="SiteSurveyor AI — Model Context Protocol (MCP) Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse", "streamable-http"],
        default="stdio",
        help="MCP Transport protocol to use (default: stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind when running SSE transport (default: 8000)",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host address to bind when running SSE transport (default: 0.0.0.0)",
    )

    args = parser.parse_args()

    if args.transport == "stdio":
        # Run stdio transport
        mcp.run(transport="stdio")
    elif args.transport == "sse":
        # Run SSE transport
        mcp.run(transport="sse", host=args.host, port=args.port)
    elif args.transport == "streamable-http":
        mcp.run(transport="streamable-http", host=args.host, port=args.port)


if __name__ == "__main__":
    run_server()

