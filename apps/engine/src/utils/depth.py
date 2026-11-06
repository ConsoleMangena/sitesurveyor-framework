"""
SiteSurveyor AI — Screening Depth Model
=======================================
Turns the DEM into the two numbers a field crew asks before it mobilises: how deep to
expect water, and how deep to expect soil before solid rock.

Both come from topography alone. They are estimates that set the starting depth for
verification, not measurements of a hole that has been drilled, and every caller labels
them that way. The calibration constants live in ``cfg.DEPTH_MODEL``.
"""
from __future__ import annotations

import math

import numpy as np

import src.config as cfg


def groundwater_table(
    hac_m: np.ndarray,
    surface_water: np.ndarray | None = None,
    saturated: np.ndarray | None = None,
) -> dict[str, np.ndarray]:
    """
    Depth to the water table, wet and dry season, in metres below surface.

    In weathered crystalline terrain the table tracks the valley floor: it sits shallow
    near the channel and deepens as the interfluve rises, so height above that channel
    (HAC) is the predictor. The dry-season gradient is steeper because that is when the
    profile has drained to its lowest stand.

    ``surface_water`` marks open water (depth zero, not an estimate); ``saturated`` marks
    seasonally wet ground whose wet-season table is at the surface by definition.
    """
    m = cfg.DEPTH_MODEL
    hac = np.where(np.isfinite(hac_m), np.maximum(hac_m, 0.0), np.nan)
    wet = np.clip(m["groundwater_wet_floor_m"] + m["groundwater_wet_ratio"] * hac,
                  None, m["groundwater_max_m"]).astype("float32")
    dry = np.clip(m["groundwater_dry_floor_m"] + m["groundwater_dry_ratio"] * hac,
                  None, m["groundwater_max_m"]).astype("float32")

    if saturated is not None:
        wet = np.where(saturated, np.minimum(wet, m["wetland_wet_max_m"]), wet)
        dry = np.where(saturated, np.minimum(dry, m["wetland_dry_max_m"]), dry)
    if surface_water is not None:
        wet = np.where(surface_water, 0.0, wet)
        dry = np.where(surface_water, 0.0, dry)
    return {"wet": wet.astype("float32"), "dry": dry.astype("float32")}


def overburden(slope_deg: np.ndarray, relief_m: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Cover thickness per cell: low metres, high metres, and the landform band it came from.

    Slope decides whether a cell is where material leaves or where it collects, so the
    bands run from thick alluvium on the flats to bare rock on the crests. Ground with
    more than ``dissected_relief_m`` of local relief has been cut into, so its mantle has
    been stripped and the band moves one step toward the crest.

    ``relief_m`` is taken as a magnitude: local relief is signed (negative on a rise,
    positive in a hollow), and it is brokenness that strips a slope, not direction.
    """
    bands = cfg.DEPTH_MODEL["overburden_bands"]
    slope = np.asarray(slope_deg, dtype="float32")
    observed = np.isfinite(slope)

    band = np.full(slope.shape, -1, dtype="int8")
    for k, (upper, _label, _low, _high) in enumerate(bands):
        take = observed & (band < 0) & (slope <= upper)
        band[take] = k

    relief = np.abs(np.asarray(relief_m, dtype="float32"))
    dissected = np.isfinite(relief) & (relief > cfg.DEPTH_MODEL["dissected_relief_m"])
    band = np.where(dissected & (band >= 0), np.minimum(band + 1, len(bands) - 1), band)

    low = np.full(slope.shape, np.nan, dtype="float32")
    high = np.full(slope.shape, np.nan, dtype="float32")
    for k, (_upper, _label, lo, hi) in enumerate(bands):
        take = band == k
        low[take] = lo
        high[take] = hi
    return low, high, band


def landform_name(band_code) -> str | None:
    """The landform a band index stands for."""
    if band_code is None:
        return None
    try:
        code = int(band_code)
    except (TypeError, ValueError):
        return None
    bands = cfg.DEPTH_MODEL["overburden_bands"]
    if code < 0 or code >= len(bands):
        return None
    return bands[code][1]


def read_for(depth_m, ladder: str) -> str | None:
    """What a hole of this depth needs on site, from one of the method ladders."""
    value = _number(depth_m)
    if value is None:
        return None
    for limit, label in cfg.DEPTH_MODEL[ladder]:
        if value <= limit:
            return label
    return None


def borehole_read(depth_m):
    """Drilling read for a water table at this depth."""
    return read_for(depth_m, "borehole_reads")


def sampling_read(depth_m):
    """Sampling read for a first test hole to this depth."""
    return read_for(depth_m, "sampling_reads")


def test_hole_depth(cover_max_m):
    """
    Recommended depth for the first test hole: through the cover, plus penetration far
    enough into fresh rock to prove the contact rather than stop in the tail of it.
    """
    cover = _number(cover_max_m)
    if cover is None:
        return None
    return float(math.ceil(cover + cfg.DEPTH_MODEL["test_hole_penetration_m"]))


def groundwater_basis() -> dict:
    """What the depth-to-water numbers were built from, for the summary and the report."""
    m = cfg.DEPTH_MODEL
    return {
        "basis": "Depth is read off the height above the valley floor each cell drains to, "
                 f"by D8 routing on the {cfg.CELL:.0f} m DEM.",
        "channel_catchment_cells": m["channel_catchment_cells"],
        "wet_season": {"floor_m": m["groundwater_wet_floor_m"], "ratio": m["groundwater_wet_ratio"]},
        "dry_season": {"floor_m": m["groundwater_dry_floor_m"], "ratio": m["groundwater_dry_ratio"]},
        "ceiling_m": m["groundwater_max_m"],
        "confirm_with": "A VES sounding or the water level in a neighbouring borehole.",
    }


def overburden_basis() -> dict:
    """What the cover and test-hole numbers were built from."""
    m = cfg.DEPTH_MODEL
    return {
        "basis": "Cover is banded by slope and thinned where local relief has stripped it, "
                 f"both read off the {cfg.CELL:.0f} m DEM.",
        "bands": [{"landform": label,
                   # The last band is the catch-all, so its limit is open. Emitting that as
                   # null rather than Infinity keeps the summary parseable by strict JSON
                   # readers; the report renders the open end from the previous band.
                   "max_slope_deg": upper if math.isfinite(upper) else None,
                   "cover_m": [low, high]}
                  for upper, label, low, high in m["overburden_bands"]],
        "dissected_relief_m": m["dissected_relief_m"],
        "test_hole_penetration_m": m["test_hole_penetration_m"],
        "confirm_with": "An auger hole or hand pit through the cover to fresh rock.",
    }


def _number(value):
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None
