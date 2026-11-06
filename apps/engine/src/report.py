"""
SiteSurveyor AI — Master Site Intelligence Dossier Generator
============================================================
Synthesizes satellite survey results across all operational categories
(Groundwater, Minerals, Soil Capability, Hazard & Risk) into the machine-readable
executive dossier. The client-facing documents are the per-category reports that
src/category_report.py renders from this JSON.
"""
from __future__ import annotations

import base64
import json
import sys
from datetime import datetime
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.config as cfg


def _load_category(path: Path) -> tuple[dict | None, str]:
    """Load a category summary and say *why* it is absent.

    A corrupt or unreadable file must not report as "analysis not run": the two
    need different remedies, and downstream readers only see the JSON.
    """
    if not path.exists():
        return None, "not_run"
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return None, f"unreadable ({type(e).__name__}: {e})"
    if not isinstance(data, dict):
        return None, f"unexpected structure ({type(data).__name__})"
    return data, "loaded"


def _img_to_base64_src(path: Path) -> tuple[str | None, str]:
    """Embed a map as base64, or explain why the panel will be blank."""
    if not path.exists():
        return None, "map file not produced"
    try:
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception as e:
        return None, f"map file unreadable ({type(e).__name__}: {e})"
    if not encoded:
        return None, "map file is empty"
    return f"data:image/png;base64,{encoded}", "embedded"


def _survey_identity(sections: list[dict | None]) -> dict | None:
    """The site and client the loaded category files were actually produced for.

    Every summary carries the coordinates it was generated from, so the dossier can name
    the ground it is reporting on instead of trusting whichever AOI the process happens
    to be holding right now.
    """
    for data in sections:
        if not isinstance(data, dict):
            continue
        coords = data.get("target_coordinates")
        if isinstance(coords, dict):
            lat, lon = coords.get("latitude"), coords.get("longitude")
        else:
            lat, lon = data.get("target_lat"), data.get("target_lon")
        numeric = isinstance(lat, (int, float)) and not isinstance(lat, bool)
        numeric = numeric and isinstance(lon, (int, float)) and not isinstance(lon, bool)
        if numeric:
            return {
                "latitude": float(lat),
                "longitude": float(lon),
                "client": data.get("client") or None,
                "address": data.get("address") or None,
            }
    return None


def generate_site_dossier(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> dict:
    """Consolidate all category survey outputs into a master site dossier."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg=half_deg, client=client, address=address)

    print("=" * 65)
    print(f"SiteSurveyor AI -- Generating Executive Multi-Category Site Dossier [{cfg.AOI_SLUG}]")
    print(f"Target: ({cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}) | Client: {cfg.CLIENT}")
    print("=" * 65)

    water_data, water_status = _load_category(cfg.OUT / "summary.json")
    minerals_data, minerals_status = _load_category(cfg.OUT / "mineral_summary.json")
    soil_data, soil_status = _load_category(cfg.OUT / "soil_summary.json")
    hazard_data, hazard_status = _load_category(cfg.OUT / "hazard_summary.json")

    # A restarted engine holds its compiled default AOI while the survey files on disk
    # still belong to the previous client. Reporting the surveyed site rather than the
    # live config is what stops one client's coordinates heading another client's numbers.
    identity = _survey_identity([water_data, minerals_data, soil_data, hazard_data])
    if identity:
        if (round(identity["latitude"], 5), round(identity["longitude"], 5)) != (
                round(cfg.TARGET_LAT, 5), round(cfg.TARGET_LON, 5)):
            print(f"  [!] Survey files belong to ({identity['latitude']:.5f}, {identity['longitude']:.5f})"
                  f" [{identity['client'] or 'unnamed'}], not the live config target.")
    else:
        identity = {"latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON,
                    "client": cfg.CLIENT, "address": cfg.CLIENT_ADDRESS}

    # 1. Build Master JSON Dossier
    dossier = {
        "title": "SiteSurveyor AI Executive Site Intelligence Dossier",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "client": identity["client"] or cfg.CLIENT,
        "address": identity["address"] or cfg.CLIENT_ADDRESS,
        "analyst_organization": cfg.ANALYST,
        "target_coordinates": {
            "latitude": identity["latitude"],
            "longitude": identity["longitude"],
        },
        "category_status": {
            "groundwater": water_status,
            "minerals": minerals_status,
            "soil_land": soil_status,
            "hazard_safety": hazard_status,
        },
        "executive_scorecard": {},
        "categories": {},
    }

    # Water extraction
    if water_data:
        t_assess = water_data.get("target_assessment", {})
        candidates = water_data.get("candidate_sites", [])
        top_cand = candidates[0] if candidates else None
        dossier["executive_scorecard"]["groundwater"] = {
            "cell_score": t_assess.get("coordinate_cell_score"),
            "cell_class": t_assess.get("coordinate_cell_class"),
            "parcel_150m_score": t_assess.get("parcel_mean_150m"),
            "parcel_150m_class": t_assess.get("parcel_class_150m"),
            "primary_borehole_candidate": {
                "latitude": top_cand.get("latitude") if top_cand else None,
                "longitude": top_cand.get("longitude") if top_cand else None,
                "distance_km": top_cand.get("distance_from_target_km") if top_cand else None,
                "potential_score": top_cand.get("potential_score") if top_cand else None,
                "depth_to_water_wet_m": top_cand.get("depth_to_water_wet_m") if top_cand else None,
                "depth_to_water_dry_m": top_cand.get("depth_to_water_dry_m") if top_cand else None,
                "borehole_read": top_cand.get("borehole_read") if top_cand else None,
            } if top_cand else None,
        }
        dossier["categories"]["water"] = water_data

    # Minerals extraction
    if minerals_data:
        t_assess = minerals_data.get("target_assessment", {})
        candidates = minerals_data.get("candidate_targets", [])
        top_cand = candidates[0] if candidates else None
        dossier["executive_scorecard"]["minerals"] = {
            "cell_score": t_assess.get("coordinate_cell_score"),
            "cell_class": t_assess.get("coordinate_cell_class"),
            "parcel_150m_score": t_assess.get("parcel_mean_150m"),
            "parcel_150m_class": t_assess.get("parcel_class_150m"),
            "primary_mineral_target": {
                "latitude": top_cand.get("latitude") if top_cand else None,
                "longitude": top_cand.get("longitude") if top_cand else None,
                "distance_km": top_cand.get("distance_from_target_km") if top_cand else None,
                "prospectivity_score": top_cand.get("potential_score") or top_cand.get("prospectivity_score") if top_cand else None,
                "overburden_min_m": top_cand.get("overburden_min_m") if top_cand else None,
                "overburden_max_m": top_cand.get("overburden_max_m") if top_cand else None,
                "test_hole_depth_m": top_cand.get("test_hole_depth_m") if top_cand else None,
                "sampling_method": top_cand.get("sampling_method") if top_cand else None,
            } if top_cand else None,
        }
        dossier["categories"]["minerals"] = minerals_data

    # Soil extraction
    if soil_data:
        candidates = soil_data.get("candidate_areas", [])
        top_cand = candidates[0] if candidates else None
        dossier["executive_scorecard"]["soil_land"] = {
            "cell_score": soil_data.get("target_sci_score"),
            "cell_class": soil_data.get("target_sci_class"),
            "parcel_150m_score": soil_data.get("local_150m_mean_score"),
            "parcel_150m_class": soil_data.get("local_150m_class"),
            "primary_agricultural_zone": {
                "latitude": top_cand.get("latitude") if top_cand else None,
                "longitude": top_cand.get("longitude") if top_cand else None,
                "distance_km": top_cand.get("distance_from_target_km") if top_cand else None,
                "capability_score": top_cand.get("potential_score") if top_cand else None,
            } if top_cand else None,
        }
        dossier["categories"]["soil_land"] = soil_data

    # Hazard extraction
    if hazard_data:
        t_assess = hazard_data.get("target_assessment", {})
        safest = hazard_data.get("safest_candidate_sites", [])
        top_safe = safest[0] if safest else None
        dossier["executive_scorecard"]["hazard_safety"] = {
            "hazard_score": t_assess.get("hazard_index_score"),
            "hazard_class": t_assess.get("hazard_classification"),
            "safety_score": t_assess.get("safety_index_score"),
            "parcel_150m_hazard": t_assess.get("local_150m_mean_hazard"),
            "sub_hazards": t_assess.get("sub_hazard_breakdown", {}),
            "primary_safe_build_site": {
                "latitude": top_safe.get("latitude") if top_safe else None,
                "longitude": top_safe.get("longitude") if top_safe else None,
                "distance_km": top_safe.get("distance_from_target_km") if top_safe else None,
                "safety_score": top_safe.get("potential_score") if top_safe else None,
            } if top_safe else None,
        }
        dossier["categories"]["hazard_safety"] = hazard_data

    # Save Master JSON
    json_path = cfg.OUT / "master_site_dossier.json"
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(dossier, fh, indent=2)
    print("  [OK] master_site_dossier.json")

    print("\n[OK] Master Site Dossier successfully generated!")
    return dossier


if __name__ == "__main__":
    generate_site_dossier()

