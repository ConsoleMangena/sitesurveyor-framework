from __future__ import annotations

import hashlib
import json
import platform
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import src.config as cfg
from src.utils import commodities, depth

SCORE_BASIS = "aoi_relative_weighted_index"
CLAIM_CEILING = (
    "Satellite screening for investigation priorities only. Scores are relative indices, "
    "not percentiles, probabilities, mineral grades, water yields or proof of buildability. "
    "Depths are terrain-based estimates, not borehole measurements."
)


CATEGORY_INPUTS = {
    "water": ["dem.tif", "landcover.tif", "alos.tif", "rain_mean.tif", "optical.tif"],
    "minerals": ["dem.tif", "landcover.tif", "alos.tif", "optical.tif"],
    "soil": ["dem.tif", "landcover.tif", "rain_mean.tif", "optical.tif", "fc_ls_2023.tif", "crop_mask.tif"],
    "hazard": ["dem.tif", "landcover.tif", "rain_mean.tif", "optical.tif", "wofs.tif", "fc_ls_2023.tif"],
}


def model_identity() -> dict:
    source = hashlib.sha256()
    for path in sorted((cfg.ROOT / "src").rglob("*.py")):
        source.update(path.relative_to(cfg.ROOT).as_posix().encode("utf-8") + b"\0")
        source.update(path.read_bytes().replace(b"\r\n", b"\n") + b"\0")
    parameters = {
        "water_weights": cfg.WATER_WEIGHTS,
        "soil_weights": cfg.SOIL_WEIGHTS,
        "hazard_weights": cfg.HAZARD_WEIGHTS,
        "gold_weights": cfg.MINERAL_WEIGHTS,
        "commodity_weights": {c.key: c.weights for c in commodities.COMMODITIES},
        "minimum_evidence_weight": commodities.MIN_WEIGHT_COVERAGE,
        "groundwater_depth": depth.groundwater_basis(),
        "overburden_depth": depth.overburden_basis(),
    }
    encoded = json.dumps(parameters, sort_keys=True, allow_nan=False).encode("utf-8")
    runtime = {name: version(name) for name in ("numpy", "scipy", "rasterio", "pyproj", "scikit-image")}
    runtime["python"] = platform.python_version()
    return {
        "version": "sha256:" + source.hexdigest(),
        "parameters_sha256": hashlib.sha256(encoded).hexdigest(),
        "parameters": json.loads(encoded),
        "runtime": runtime,
    }


def input_manifest(names: list[str]) -> dict:
    from src.fetch_data import provenance_detail

    inputs = {}
    for name in sorted(set(names)):
        path = cfg.RAW / name
        if not path.is_file():
            inputs[name] = {"status": "missing"}
            continue
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        inputs[name] = {
            "status": "available",
            "sha256": digest,
            "size_bytes": path.stat().st_size,
            "source_record": provenance_detail(path.stem) or None,
        }
    return inputs


def gravity_fingerprint() -> dict:
    """Identity of the gravity input, including the kind it declares.

    The scoring gate turns on that kind, so swapping a modelled calibration field for a
    measured survey has to invalidate a cached run. Hashing the pixels alone would miss
    a re-tag, and hashing the tag alone would miss a replacement grid.
    """
    from src.utils.gravity import find_gravity_raster, read_source_tags

    path = find_gravity_raster()
    if path is None:
        return {"status": "absent"}
    kind, citation = read_source_tags(path)
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    return {
        "status": "available",
        "file": path.name,
        "sha256": digest,
        "kind": kind,
        "citation": citation,
    }


def cache_mismatch(record: dict | None, latitude: float, longitude: float) -> str | None:
    if not isinstance(record, dict) or record.get("schema_version") != 1:
        return "reproducibility record missing or unsupported"
    category = record.get("category")
    if not isinstance(category, str) or category not in CATEGORY_INPUTS:
        return "survey category not recorded"
    if record.get("target") != cfg.target_block(latitude, longitude, cfg.HALF_DEG):
        return "survey geometry changed"
    if record.get("grid") != {
        "width": cfg.WIDTH, "height": cfg.HEIGHT,
        "transform": list(cfg.TRANSFORM)[:6], "crs": str(cfg.LOCAL_CRS),
    }:
        return "analysis grid changed"
    if record.get("model") != model_identity():
        return "model, parameters or runtime changed"
    if record.get("inputs") != input_manifest(CATEGORY_INPUTS[category]):
        return "input rasters or their source records changed"
    from src.fetch_data import scenes_used
    if record.get("optical_scenes") != scenes_used():
        return "optical scene record changed"
    # Only minerals records a gravimetry block; the other categories would mismatch forever.
    if category == "minerals":
        if (record.get("gravimetry") or {}).get("input") != gravity_fingerprint():
            return "gravity input or its declared kind changed"
    return None


def capture_provenance(category: str, input_names: list[str]) -> dict:
    from src.fetch_data import scenes_used, used_sources

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "category": category,
        "model": model_identity(),
        "target": cfg.target_block(cfg.TARGET_LAT, cfg.TARGET_LON, cfg.HALF_DEG),
        "grid": {
            "width": cfg.WIDTH,
            "height": cfg.HEIGHT,
            "transform": list(cfg.TRANSFORM)[:6],
            "crs": str(cfg.LOCAL_CRS),
        },
        "inputs": input_manifest(CATEGORY_INPUTS[category]),
        "used_inputs": sorted(set(input_names)),
        "data_sources": used_sources(layers=[Path(name).stem for name in input_names]),
        "optical_scenes": scenes_used() if "optical.tif" in input_names else [],
        "score_basis": SCORE_BASIS,
        "claim_ceiling": CLAIM_CEILING,
        "field_validation": {
            "status": "not_validated_against_field_measurements",
            "reference_observations": 0,
            "accuracy": None,
            "confidence_interval": None,
            "required_evidence": {
                "water": "Borehole water levels, drilling logs and pumping tests",
                "minerals": "Geological mapping and laboratory geochemical assays",
                "soil": "Soil profiles, laboratory tests and local agronomic observations",
                "hazard": "Recorded hazard events and site-specific engineering investigation",
            }[category],
        },
    }
