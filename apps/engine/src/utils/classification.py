"""
SiteSurveyor AI — Classification & Siting Utilities
===================================================
Natural breaks (1-D k-means in pure numpy), potential zone classification,
and distance-constrained local peak picking for candidate borehole/target sites.
"""
from __future__ import annotations

from pathlib import Path

# Import config FIRST before rasterio to ensure PROJ paths are initialized
import src.config as cfg

import numpy as np
from scipy.ndimage import maximum_filter

from src.utils.commodities import (
    COMMODITIES,
    COMMODITY_ZONE_CODES,
    ZONE_BELOW_THRESHOLD,
    ZONE_BUILTUP,
    ZONE_WATER,
)
from src.utils.raster import pixel_to_lonlat

# Zone raster class domain. 255 is reserved for pixels with no usable satellite
# coverage: an unobserved pixel must never be reported as a scored class.
NODATA_CLASS = 255
MIN_SCORED_CLASS = 1
MAX_SCORED_CLASS = 5


def jenks_breaks(values: np.ndarray, k: int = 5, max_iter: int = 25) -> np.ndarray:
    """
    Compute natural breaks using 1-D k-means clustering in pure NumPy.
    Returns:
        Sorted array of k - 1 interior break thresholds.
    """
    v = values[np.isfinite(values)].astype("float64")
    if v.size == 0:
        return np.linspace(0.0, 1.0, k + 1)[1:-1].astype("float32")
    if len(v) < k * 5:
        return np.linspace(v.min(), v.max(), k + 1)[1:-1].astype("float32")

    # Sample for performance if large. A local generator keeps this function
    # reproducible without reseeding the caller's global RNG stream.
    if len(v) > 25000:
        v_sub = np.random.default_rng(42).choice(v, 25000, replace=False)
    else:
        v_sub = v

    # Initialize centers as evenly spaced quantiles
    centers = np.quantile(v_sub, np.linspace(0.1, 0.9, k))

    for _ in range(max_iter):
        dists = np.abs(v_sub[:, None] - centers[None, :])
        labels = np.argmin(dists, axis=1)

        new_centers = np.empty(k, dtype="float64")
        for i in range(k):
            mask = (labels == i)
            new_centers[i] = v_sub[mask].mean() if np.any(mask) else centers[i]

        new_centers.sort()
        if np.allclose(centers, new_centers, atol=1e-3):
            break
        centers = new_centers

    breaks = (centers[:-1] + centers[1:]) / 2.0
    return np.sort(breaks).astype("float32")


def classify_zones(
    index_0_100: np.ndarray,
    breaks: np.ndarray,
    water_mask: np.ndarray | None = None,
    builtup_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Classify continuous 0-100 index into zones:
        0: Water (excluded)
        1: Very Low
        2: Low
        3: Moderate
        4: High
        5: Very High
        6: Built-up / Settlement (excluded)
        255: No data — the index is not finite at this pixel

    np.digitize places NaN in the highest bin, so non-finite pixels are
    classified here explicitly instead of silently becoming "Very High".
    """
    zones = np.full(index_0_100.shape, NODATA_CLASS, dtype="uint8")

    finite = np.isfinite(index_0_100)
    if np.any(finite):
        scored = np.clip(
            np.digitize(index_0_100[finite], breaks) + 1,
            MIN_SCORED_CLASS,
            MAX_SCORED_CLASS,
        )
        zones[finite] = scored

    if water_mask is not None:
        zones[np.asarray(water_mask, dtype=bool)] = 0

    if builtup_mask is not None:
        zones[np.asarray(builtup_mask, dtype=bool)] = 6

    return zones


CLASS_NAMES = {
    NODATA_CLASS: "No data",
    0: "Water",
    1: "Very low",
    2: "Low",
    3: "Moderate",
    4: "High",
    5: "Very high",
    6: "Built-up",
}

# Map colours for unobserved ground, kept out of every ranked palette so a void
# cannot read as either the best or the worst class.
NODATA_HEX = "#b8b8b8"
NODATA_RGB = tuple(184 / 255 for _ in range(3))

# The minerals category is not a five-step ramp: a cell takes the colour of whichever
# mineral system scores highest there. Codes come from the catalogue, so the GeoTIFF colour
# table, the PNG sheet and the web legend are painted from one list.
MINERAL_ZONE_PALETTE = [
    "#08306b",
    *(c.color for c in COMMODITIES),
    "#e8e8e8",
    "#7f7f7f",
]
MINERAL_ZONE_LABELS = {
    ZONE_WATER: "Water body",
    **{COMMODITY_ZONE_CODES[c.key]: f"{c.name} ({c.symbol})" for c in COMMODITIES},
    ZONE_BELOW_THRESHOLD: "No mineral system above threshold",
    ZONE_BUILTUP: "Built-up (excluded)",
}

#: Cold ground is a result, not a zone to paint over the imagery. The PNG sheet shades it
#: grey with the terrain; the draped copies leave it clear so the reader can see what is
#: actually there and judge the screen against it. A GeoTIFF colour table is RGB-only, so
#: this cannot ride in the palette - every surface that drapes applies it explicitly.
MINERAL_TRANSPARENT_CODES = (ZONE_BELOW_THRESHOLD,)
ZONE_TRANSPARENT_CODES: dict[str, tuple[int, ...]] = {"minerals": MINERAL_TRANSPARENT_CODES}

# Ranked class colours, indexed by zone code. One table serves the GeoTIFF
# colour table, the PNG overlay, and the web fallback, so a class painted in the
# browser is the same class a desktop GIS paints from the file itself.
ZONE_PALETTES: dict[str, list[str]] = {
    "water": ["#1f77b4", "#d73027", "#f46d43", "#fdae61", "#a6d96a", "#1a9850", "#7f7f7f"],
    "minerals": MINERAL_ZONE_PALETTE,
    "soil": ["#2166ac", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850", "#808080"],
    "hazard": ["#2166ac", "#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027", "#808080"],
}

# The words each category puts on its classes. One table per category because "Low" is
# a different promise in each: low prospectivity is worth a trench, low capability is
# worth a soil test, low hazard is worth nothing at all.
ZONE_LABELS: dict[str, dict[int, str]] = {
    "water": {
        0: "Water body",
        1: "Very low potential",
        2: "Low potential",
        3: "Moderate potential",
        4: "High potential",
        5: "Very high potential",
        6: "Built-up (excluded)",
    },
    "minerals": MINERAL_ZONE_LABELS,
    "soil": {
        0: "Water body",
        1: "Very low capability",
        2: "Low capability",
        3: "Moderate capability",
        4: "High capability",
        5: "Very high capability",
        6: "Built-up (excluded)",
    },
    "hazard": {
        0: "Water body",
        1: "Very low hazard (safe)",
        2: "Low hazard",
        3: "Moderate hazard",
        4: "High hazard",
        5: "Very high hazard",
        6: "Built-up (excluded)",
    },
}


def zone_class(score: float, breaks: np.ndarray) -> int:
    """
    Class a single score into the zone domain.

    A non-finite score is unobserved, not extreme, so it maps to NODATA_CLASS
    rather than the top bin that np.digitize would assign.
    """
    if not np.isfinite(score):
        return NODATA_CLASS
    return int(min(max(np.digitize(score, breaks) + 1, MIN_SCORED_CLASS), MAX_SCORED_CLASS))


def safe_round(value: float, ndigits: int = 1) -> float | None:
    """
    Round for JSON output.

    Unobserved values serialize as null; json.dumps would otherwise emit a bare
    NaN, which strict parsers (including JavaScript JSON.parse) reject.
    """
    v = float(value)
    return round(v, ndigits) if np.isfinite(v) else None


def finite_mean(values: np.ndarray) -> float:
    """Mean over observed cells only; NaN when the window holds no coverage."""
    v = np.asarray(values)[np.isfinite(values)]
    return float(v.mean()) if v.size else float("nan")


def paint_zones(
    classes: np.ndarray,
    cmap,
    hillshade: np.ndarray | None = None,
) -> np.ndarray:
    """
    Paint a classified zone raster as (H, W, 3) float RGB.

    The divisor is the palette's own length, so a five-step prospectivity ramp and a
    twelve-class mineral catalogue both land their codes on their own colours. Ranked
    palettes clamp out-of-range values to their extreme colour, so a 255 no-data cell
    would otherwise print as the top class; voids are painted flat gray instead.
    """
    steps = max(getattr(cmap, "N", 7) - 1, 1)
    rgb = np.asarray(cmap(np.clip(classes / steps, 0.0, 1.0))[..., :3], dtype="float32")
    rgb[classes == NODATA_CLASS] = NODATA_RGB

    if hillshade is not None:
        hs = np.where(np.isfinite(hillshade), hillshade, np.float32(0.5)).astype("float32")
        rgb = np.clip(rgb * (0.65 + 0.35 * hs[..., None]), 0.0, 1.0).astype("float32")

    return rgb


def find_candidate_sites(
    index_0_100: np.ndarray,
    classes: np.ndarray,
    min_class: int = 4,
    min_distance_m: float = 300.0,
    top_k: int = 8,
    target_row: int | None = None,
    target_col: int | None = None,
    max_distance_km: float | None = None,
    border_margin_px: int = 25,
    proximity_weight: float = 0.08,
) -> list[dict]:
    """
    Find ranked candidate sites using local peak-picking with spatial suppression
    and client proximity prioritization.

    Args:
        index_0_100: Continuous potential index (0-100)
        classes: Discrete zone class raster (0-6, or 255 for no coverage)
        min_class: Minimum class required for candidates (default 4 = High)
        min_distance_m: Minimum spatial spacing between candidate sites
        top_k: Maximum number of ranked candidates to return
        target_row: Row index of client property / target
        target_col: Col index of client property / target
        max_distance_km: Optional hard radius constraint (km) from target
        border_margin_px: Exclude pixels near outer raster edges to eliminate boundary artifacts
        proximity_weight: Weight penalty per km distance to prioritize accessible sites near property

    Returns:
        List of dicts with keys: rank, row, col, lon, lat, potential_score, class_name, distance_from_target_km
    """
    if target_row is None:
        target_row = cfg.TARGET_ROW
    if target_col is None:
        target_col = cfg.TARGET_COL

    min_dist_px = int(np.ceil(min_distance_m / cfg.CELL))
    size = min_dist_px * 2 + 1

    eligible = (classes >= min_class) & (classes <= 5) & np.isfinite(index_0_100)

    # Exclude boundary margins to prevent edge artifacts
    if border_margin_px > 0:
        eligible[:border_margin_px, :] = False
        eligible[-border_margin_px:, :] = False
        eligible[:, :border_margin_px] = False
        eligible[:, -border_margin_px:] = False

    # Optional hard distance constraint
    if max_distance_km is not None:
        h, w = index_0_100.shape
        yy, xx = np.indices((h, w))
        dist_all_km = np.hypot(yy - target_row, xx - target_col) * cfg.CELL / 1000.0
        eligible[dist_all_km > max_distance_km] = False

    masked_index = np.where(eligible, index_0_100, -1.0)
    local_max = maximum_filter(masked_index, size=size, mode="constant", cval=-1.0)
    peaks = (masked_index == local_max) & (masked_index > 0)

    rows, cols = np.where(peaks)
    if len(rows) == 0:
        return []

    scores = index_0_100[rows, cols]
    dists_km = np.hypot(rows - target_row, cols - target_col) * cfg.CELL / 1000.0

    # Rank metric: balances high potential score with client proximity
    rank_metrics = scores / (1.0 + proximity_weight * dists_km)
    sort_order = np.argsort(-rank_metrics)

    class_names = CLASS_NAMES

    candidates: list[dict] = []
    selected_coords: list[tuple[int, int]] = []

    for idx in sort_order:
        r, c = int(rows[idx]), int(cols[idx])

        too_close = False
        for sr, sc in selected_coords:
            dist_px = np.hypot(r - sr, c - sc)
            if dist_px * cfg.CELL < min_distance_m:
                too_close = True
                break
        if too_close:
            continue

        selected_coords.append((r, c))
        lon, lat = pixel_to_lonlat(r, c)
        cls_val = int(classes[r, c])

        candidates.append({
            "rank": len(candidates) + 1,
            "row": r,
            "col": c,
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            "potential_score": round(float(scores[idx]), 1),
            "class_code": cls_val,
            "class_name": class_names.get(cls_val, "Unknown"),
            "distance_from_target_km": round(float(dists_km[idx]), 2),
        })

        if len(candidates) >= top_k:
            break

    return candidates


def export_classified_overlay(
    classes: np.ndarray,
    path: Path,
    colors: list[str] | None = None,
    transparent_codes: tuple[int, ...] = (),
) -> None:
    """Export a clean RGBA PNG overlay with 100% transparent nodata.

    No axes, no borders, no text labels -- pure pixel classification ready for web map draping.
    `transparent_codes` clears classes that should leave the imagery beneath them visible.
    """
    from PIL import Image

    if colors is None:
        colors = ZONE_PALETTES["water"]

    def hex_to_rgb(h: str) -> tuple[int, int, int]:
        clean = h.lstrip("#")
        return tuple(int(clean[i : i + 2], 16) for i in (0, 2, 4))

    rgba = np.zeros((classes.shape[0], classes.shape[1], 4), dtype=np.uint8)
    for code, hex_c in enumerate(colors):
        if code in transparent_codes:
            continue
        rgb = hex_to_rgb(hex_c)
        rgba[classes == code] = (rgb[0], rgb[1], rgb[2], 215)

    # Nodata class is completely transparent
    rgba[classes == NODATA_CLASS] = (0, 0, 0, 0)

    Image.fromarray(rgba, mode="RGBA").save(path, optimize=True)
