"""
SiteSurveyor AI — Single-Category Export Package
================================================
Builds the deliverables the Exports panel hands out per category: a standalone client
report for one survey line, a viewer for the classified GeoTIFF behind it, and the
inventory that says which of those this instance can actually produce right now.

Everything is read off the artefacts already on disk. No engine runs here, so generating
a report cannot re-fetch satellite imagery, rewrite a survey's numbers, or disagree with
the dossier compiled from the same files.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from html import escape as _e
from pathlib import Path

import numpy as np

import src.config as cfg
from src import fetch_data
from src.report import _img_to_base64_src, _load_category, _survey_identity
from src.utils.classification import NODATA_CLASS, NODATA_HEX

NO_DATA_LABEL = "No satellite coverage"


@dataclass(frozen=True)
class DetailColumn:
    """A ranked-table column built from the field numbers an engine attaches to a site.

    ``keys`` are summary keys, not presentation strings, so the report table, the raster
    viewer and the ZIP all read the same value the CSV and GeoJSON carry.
    """

    label: str
    fmt: str
    keys: tuple[str, ...]


@dataclass(frozen=True)
class Category:
    """One survey line: its files, its vocabulary and the claims its numbers support."""

    key: str
    slug: str
    name: str
    short: str
    hue: str
    accent: str
    accent_dark: str
    summary_file: str
    candidates_key: str
    candidate_noun: str
    metric_label: str
    parcel_label: str
    score_labels: tuple[str, str]
    verification: str
    claim_limit: str
    maps: tuple[tuple[str, str, str], ...]
    zones_tif: str
    index_tif: str
    index_label: str
    vector_base: str
    zone_labels: dict[int, str] = field(default_factory=dict)
    zone_colors: dict[int, str] = field(default_factory=dict)
    cand_labels: dict[int, str] = field(default_factory=dict)
    hazard_raster: bool = False
    detail_columns: tuple[DetailColumn, ...] = ()


def _ramp(colors: list[str], labels: dict[int, str]) -> tuple[dict[int, str], dict[int, str]]:
    """Class codes 0-6 in palette order, plus the void, in one place per category."""
    return ({i: c for i, c in enumerate(colors)}, {**labels, NODATA_CLASS: NO_DATA_LABEL})


_WATER_COLORS, _WATER_LABELS = _ramp(
    ["#1f77b4", "#d73027", "#f46d43", "#fdae61", "#a6d96a", "#1a9850", "#7f7f7f"],
    {
        0: "Water body",
        1: "Very low potential",
        2: "Low potential",
        3: "Moderate potential",
        4: "High potential",
        5: "Very high potential",
        6: "Built-up (excluded)",
    },
)
_MINERAL_COLORS, _MINERAL_LABELS = _ramp(
    ["#1f77b4", "#4575b4", "#74add1", "#fee090", "#f46d43", "#d73027", "#7f7f7f"],
    {
        0: "Water body",
        1: "Very low prospectivity",
        2: "Low prospectivity",
        3: "Moderate prospectivity",
        4: "High prospectivity",
        5: "Very high prospectivity",
        6: "Built-up (excluded)",
    },
)
_SOIL_COLORS, _SOIL_LABELS = _ramp(
    ["#2166ac", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850", "#808080"],
    {
        0: "Water body",
        1: "Very low capability",
        2: "Low capability",
        3: "Moderate capability",
        4: "High capability",
        5: "Very high capability",
        6: "Built-up (excluded)",
    },
)
_HAZARD_COLORS, _HAZARD_LABELS = _ramp(
    ["#2166ac", "#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027", "#808080"],
    {
        0: "Water body",
        1: "Very low hazard (safe)",
        2: "Low hazard",
        3: "Moderate hazard",
        4: "High hazard",
        5: "Very high hazard",
        6: "Built-up (excluded)",
    },
)

_SAFETY_LABELS = {
    0: "Water body",
    1: "Very low safety",
    2: "Low safety",
    3: "Moderate safety",
    4: "High safety",
    5: "Very high safety",
    6: "Built-up (excluded)",
}

WATER = Category(
    key="water", slug="groundwater", name="Groundwater Potential", short="Groundwater",
    hue="#38bdf8", accent="#0369a1", accent_dark="#5ab2e8",
    summary_file="summary.json", candidates_key="candidate_sites", candidate_noun="Borehole",
    metric_label="Groundwater Potential Index", parcel_label="150 m parcel mean",
    score_labels=("coordinate_cell_score", "coordinate_cell_class"),
    verification="Vertical Electrical Sounding (VES) resistivity verification",
    claim_limit="This ranks where to investigate. It is not water yield, borehole success or "
               "aquifer depth, and it does not licence drilling.",
    maps=(
        ("groundwater_potential_map.png", "Groundwater potential zoning across the survey area",
         "Survey area shaded by groundwater potential class, with the client target starred "
         "and each ranked drilling candidate labelled by rank."),
        ("site_zoom_map.png", "Local siting zoom, 5 x 5 km around the property",
         "Five by five kilometre zoom around the client property, plotting candidate borehole "
         "positions as an offset from the target in kilometres."),
        ("evidence_layers.png", "Evidence layers behind the index",
         "The slope, lineament, land cover and index rasters the groundwater model combines."),
    ),
    zones_tif="groundwater_potential_zones.tif", index_tif="gwpz_index.tif",
    index_label="Groundwater Potential Index (0-100)",
    vector_base="candidate_borehole_sites",
    zone_labels=_WATER_LABELS, zone_colors=_WATER_COLORS, cand_labels=_WATER_LABELS,
    detail_columns=(
        DetailColumn("Depth to water (wet–dry)", "range_m",
                     ("depth_to_water_wet_m", "depth_to_water_dry_m")),
        DetailColumn("Borehole type", "text", ("borehole_read",)),
        DetailColumn("Rise above valley floor", "m", ("height_above_channel_m",)),
    ),
)

MINERALS = Category(
    key="minerals", slug="minerals", name="Mineral Prospectivity", short="Minerals",
    hue="#f59e0b", accent="#a16207", accent_dark="#eab44a",
    summary_file="mineral_summary.json", candidates_key="candidate_targets",
    candidate_noun="Target",
    metric_label="Mineral Prospectivity Index", parcel_label="150 m parcel mean",
    score_labels=("coordinate_cell_score", "coordinate_cell_class"),
    verification="Ground geological mapping and soil geochemical sampling",
    claim_limit="This ranks where to sample. It is not mineral grade, tonnage or economic "
                "viability, and it does not licence excavation.",
    maps=(
        ("mineral_prospectivity_map.png", "Mineral prospectivity and shear-zone zoning",
         "Survey area shaded by gold and shear-system prospectivity class, with the client "
         "target starred and ranked exploration targets labelled by rank."),
        ("mineral_evidence_layers.png", "Evidence layers behind the prospectivity index",
         "The lineament, alteration, relief and endowment rasters the mineral model combines."),
    ),
    zones_tif="mineral_prospectivity_zones.tif", index_tif="mineral_prospectivity_index.tif",
    index_label="Mineral Prospectivity Index (0-100)",
    vector_base="candidate_mineral_targets",
    zone_labels=_MINERAL_LABELS, zone_colors=_MINERAL_COLORS, cand_labels=_MINERAL_LABELS,
    detail_columns=(
        DetailColumn("Cover to fresh rock", "range_m",
                     ("overburden_min_m", "overburden_max_m")),
        DetailColumn("First test hole", "m", ("test_hole_depth_m",)),
        DetailColumn("Sampling method", "text", ("sampling_method",)),
    ),
)

SOIL = Category(
    key="soil", slug="soil", name="Soil & Land Capability", short="Soil & Land",
    hue="#10b981", accent="#047857", accent_dark="#5ed3a6",
    summary_file="soil_summary.json", candidates_key="candidate_areas", candidate_noun="Zone",
    metric_label="Soil & Land Capability Index", parcel_label="150 m parcel mean",
    score_labels=("target_sci_score", "target_sci_class"),
    verification="Agronomic soil profile test and pH analysis",
    claim_limit="This is a screening-level capability proxy from orbit. It is not a soil "
                "classification and not a fertiliser or irrigation prescription.",
    maps=(
        ("soil_capability_map.png", "Soil and land capability zoning",
         "Survey area shaded by soil and land capability class, with the client target starred "
         "and ranked candidate zones labelled by rank."),
        ("soil_zone_zoom.png", "Local capability zoom, 5 x 5 km around the property",
         "Five by five kilometre zoom around the client property, plotting candidate land "
         "zones as an offset from the target in kilometres."),
        ("soil_evidence_layers.png", "Evidence layers behind the capability index",
         "The erosion, moisture, vegetation and land cover rasters the soil model combines."),
    ),
    zones_tif="soil_capability_zones.tif", index_tif="soil_capability_index.tif",
    index_label="Soil & Land Capability Index (0-100)",
    vector_base="candidate_land_zones",
    zone_labels=_SOIL_LABELS, zone_colors=_SOIL_COLORS, cand_labels=_SOIL_LABELS,
)

HAZARD = Category(
    key="hazard", slug="hazard", name="Natural Hazard & Site Safety", short="Hazard & Safety",
    hue="#f43f5e", accent="#be123c", accent_dark="#f58ba0",
    summary_file="hazard_summary.json", candidates_key="safest_candidate_sites",
    candidate_noun="Safe Zone",
    metric_label="Site Safety Index", parcel_label="150 m parcel mean hazard",
    score_labels=("hazard_index_score", "hazard_classification"),
    verification="Geotechnical soil compaction and foundation investigation",
    claim_limit="This is a screening-level exposure proxy. It is not a design-event flood "
                "level, a slope-stability calculation or a geotechnical sign-off.",
    maps=(
        ("hazard_risk_map.png", "Composite natural hazard risk zoning",
         "Survey area shaded by composite hazard risk class, with the client target starred "
         "and the safest ranked build sites labelled by rank."),
        ("site_hazard_zoom.png", "Site safety zoom, 5 x 5 km around the property",
         "Five by five kilometre zoom around the client property, plotting the safest build "
         "sites as an offset from the target in kilometres."),
        ("hazard_evidence_layers.png", "Evidence layers behind the hazard index",
         "The flood, slope, erosion, fuel and drought rasters the hazard model combines."),
    ),
    zones_tif="hazard_risk_zones.tif", index_tif="hazard_composite_index.tif",
    index_label="Composite Hazard Index (0-100)",
    vector_base="safest_buildable_sites",
    zone_labels=_HAZARD_LABELS, zone_colors=_HAZARD_COLORS, cand_labels=_SAFETY_LABELS,
    hazard_raster=True,
)

CATEGORIES: dict[str, Category] = {c.key: c for c in (WATER, MINERALS, SOIL, HAZARD)}
CATEGORY_ORDER: tuple[str, ...] = tuple(CATEGORIES)


# ---------------------------------------------------------------------------
# The classified raster, decoded
# ---------------------------------------------------------------------------
_KEY_STEP = 64  # control-point spacing for the pixel -> lat/lon grid in the viewer


def _hex_rgb(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def decode_raster(cat: Category) -> dict | None:
    """Read the classified GeoTIFF and its index into arrays, counts and geometry.

    The raster on disk is the authority here: extents, cell size, CRS and class shares are
    all taken from it, so the viewer describes the image the engine actually wrote rather
    than whichever AOI this process is currently pointing at.
    """
    zones = cfg.OUT / cat.zones_tif
    if not zones.exists():
        return None
    try:
        import rasterio
        from pyproj import Transformer
    except Exception:
        return None
    try:
        with rasterio.open(zones) as ds:
            classes = np.asarray(ds.read(1), dtype="uint8")
            transform = ds.transform
            crs = ds.crs
            height, width = classes.shape
            index = None
            index_file = cfg.OUT / cat.index_tif
            if index_file.exists():
                try:
                    with rasterio.open(index_file) as ids:
                        index = np.asarray(ids.read(1), dtype="float32")
                except Exception:
                    index = None
    except Exception:
        return None

    rgb = np.zeros((height, width, 3), dtype="uint8")
    for code in range(0, 7):
        rgb[classes == code] = _hex_rgb(cat.zone_colors[code])
    rgb[classes == NODATA_CLASS] = _hex_rgb(NODATA_HEX)

    cell_x = abs(float(transform.a))
    cell_y = abs(float(transform.d)) or cell_x
    xmin, ymax = float(transform.c), float(transform.f)
    xmax, ymin = xmin + cell_x * width, ymax - cell_y * height
    epsg = crs.to_epsg() if crs is not None else None

    try:
        to_wgs = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        to_local = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    except Exception:
        return None

    cols = list(range(0, width, _KEY_STEP))
    rows = list(range(0, height, _KEY_STEP))
    if cols[-1] != width - 1:
        cols.append(width - 1)
    if rows[-1] != height - 1:
        rows.append(height - 1)
    grid = []
    for r in rows:
        y = ymax - (r + 0.5) * cell_y
        line = []
        for c in cols:
            lon, lat = to_wgs.transform(xmin + (c + 0.5) * cell_x, y)
            line.append([round(float(lon), 7), round(float(lat), 7)])
        grid.append(line)

    total = int(classes.size)
    classes_out = []
    for code in list(range(0, 7)) + [NODATA_CLASS]:
        count = int(np.count_nonzero(classes == code))
        if not count and code == NODATA_CLASS:
            continue
        classes_out.append({
            "code": code,
            "label": cat.zone_labels.get(code, str(code)),
            "color": cat.zone_colors.get(code, NODATA_HEX),
            "count": count,
            "pct": round(count / total * 100.0, 2) if total else 0.0,
        })

    return {
        "classes": classes,
        "rgb": rgb,
        "index": index,
        "width": width,
        "height": height,
        "cell_x": cell_x,
        "cell_y": cell_y,
        "epsg": epsg,
        "crs_name": crs.to_string() if crs is not None else "",
        "bounds_utm": [xmin, ymin, xmax, ymax],
        "cols": cols,
        "rows": rows,
        "grid": grid,
        "legend": classes_out,
        "to_local": to_local,
        "source": cat.zones_tif,
        "index_source": cat.index_tif if index is not None else None,
    }


def _pixel_of(to_local, lon: float, lat: float, cell_x: float, cell_y: float,
              xmin: float, ymax: float) -> tuple[float, float] | None:
    """Project a WGS 84 point onto raster column and row (fractional cell centres)."""
    try:
        x, y = to_local.transform(float(lon), float(lat))
    except Exception:
        return None
    col = (float(x) - xmin) / cell_x
    row = (ymax - float(y)) / cell_y
    if col < -2 or row < -2:
        return None
    return round(col, 3), round(row, 3)


def write_raster_artefacts(cat: Category, dec: dict) -> dict:
    """Write the classified PNG and the two lookup keys the viewer reads per pixel.

    The keys are single-channel PNGs of the raw arrays — class code and rounded index —
    so the browser can answer "what is under the cursor" from the survey's own raster
    instead of from a description of it.
    """
    from PIL import Image

    detail = cfg.OUT / f"{cat.slug}_raster_detail.png"
    class_key = cfg.OUT / f"{cat.slug}_class_key.png"
    score_key = cfg.OUT / f"{cat.slug}_score_key.png"
    Image.fromarray(dec["rgb"], mode="RGB").save(detail, optimize=True)
    Image.fromarray(dec["classes"], mode="L").save(class_key, optimize=True)
    if dec["index"] is not None:
        scores = np.clip(np.nan_to_num(dec["index"], nan=0.0), 0, 255).astype("uint8")
        Image.fromarray(scores, mode="L").save(score_key, optimize=True)
    elif score_key.exists():
        score_key.unlink()
    return {"detail": detail, "class_key": class_key, "score_key": score_key if dec["index"] is not None else None}


VIEWER_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Classified raster viewer: {{NAME}} survey for {{CLIENT}}.">
<title>{{NAME}} — classified raster — SiteSurveyor AI</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --cat: {{ACCENT}};
    --on-cat: #ffffff;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
    --bg: #eef2f7;
    --surface: #ffffff;
    --stage: #0b1018;
    --line: #dbe3ec;
    --line-soft: #eef2f7;
    --text: #0f172a;
    --muted: #5b6a7d;
    --quiet: #64748b;
    --chrome: #090d16;
    --chrome-line: rgba(255,255,255,.09);
    --chrome-text: #e6edf6;
    --chrome-mute: #9aa8bb;
    --shadow: 0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.22);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0f17; --surface: #121824; --line: #263042; --line-soft: #1b2231;
      --text: #eef4fb; --muted: #a9b7c8; --quiet: #7d8ca0; --stage: #06090f;
      --cat: {{ACCENT_DARK}}; --on-cat: #06090f;
      --shadow: 0 1px 2px rgba(0,0,0,.5), 0 10px 28px -14px rgba(0,0,0,.8);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; font-family: var(--font-sans); background: var(--bg); color: var(--text);
    display: flex; flex-direction: column; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  ::selection { background: var(--cat); color: var(--on-cat); }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* ---------------------------------------------------------------- masthead */
  .masthead {
    background: var(--chrome); border-top: 4px solid var(--cat);
    border-bottom: 1px solid var(--chrome-line); color: var(--chrome-text);
    padding: 18px 26px; display: flex; flex-wrap: wrap; gap: 18px;
    align-items: center; justify-content: space-between; flex: 0 0 auto;
  }
  .mast-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .mast-mark {
    width: 40px; height: 40px; border-radius: 8px; background: #111625;
    border: 1px solid var(--chrome-line); display: grid; place-items: center; padding: 7px; flex: 0 0 auto;
  }
  .mast-mark img { width: 100%; height: 100%; object-fit: contain; }
  .mast-kicker {
    font-size: 10.5px; letter-spacing: 1.1px; text-transform: uppercase;
    color: var(--chrome-mute); font-weight: 600;
  }
  .masthead h1 { margin: 2px 0 0; font-size: 19px; font-weight: 700; letter-spacing: -.3px; }
  .masthead h1 em { font-style: normal; color: var(--cat); }
  .mast-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 11.5px; color: var(--chrome-mute); }
  .mast-meta b { color: var(--chrome-text); font-weight: 600; }
  .mast-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px;
    border-radius: 7px; border: 1px solid var(--chrome-line); background: #111625;
    color: var(--chrome-text); font: inherit; font-size: 12px; font-weight: 500;
    cursor: pointer; text-decoration: none; transition: border-color .14s, background .14s, transform .14s;
  }
  .btn:hover { border-color: var(--cat); background: #161d2e; }
  .btn:active { transform: translateY(1px); }
  .btn--primary { background: var(--cat); border-color: var(--cat); color: var(--on-cat); }
  .btn--primary:hover { filter: brightness(1.06); background: var(--cat); }
  .btn:focus-visible, .swatch:focus-visible, .toggle input:focus-visible {
    outline: 2px solid var(--cat); outline-offset: 2px;
  }

  /* ------------------------------------------------------------------- shell */
  .shell {
    flex: 1 1 auto; display: grid; grid-template-columns: minmax(0,1fr) 320px;
    grid-template-rows: minmax(0,1fr); min-height: 0;
  }
  /* Without min-height:0 the flex column refuses to shrink below its content and the
     inspector strip is pushed off the bottom of short viewports. */
  .stage-col { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); }

  .toolbar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--line); flex: 0 0 auto;
  }
  .tool {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 32px; min-width: 32px; padding: 0 10px; border-radius: 7px;
    border: 1px solid var(--line); background: var(--surface); color: var(--muted);
    font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
    transition: color .14s, border-color .14s, background .14s;
  }
  .tool:hover { color: var(--text); border-color: var(--cat); }
  .tool[aria-pressed="true"] { color: var(--cat); border-color: var(--cat); background: color-mix(in srgb, var(--cat) 9%, var(--surface)); }
  .tool--icon { padding: 0; }
  .zoom-readout { font-size: 11.5px; color: var(--quiet); margin-left: 2px; }
  .toolbar .spacer { flex: 1 1 auto; }
  .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); cursor: pointer; }
  .toggle input { accent-color: var(--cat); width: 14px; height: 14px; margin: 0; }

  /* ------------------------------------------------------------------- stage */
  .stage {
    position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
    background:
      radial-gradient(120% 90% at 50% 0%, #16202f 0%, var(--stage) 62%),
      var(--stage);
    cursor: grab; touch-action: none;
  }
  .stage.is-panning { cursor: grabbing; }
  #plate { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  #plate img { display: block; image-rendering: pixelated; user-select: none; -webkit-user-drag: none; }
  #veil { position: absolute; inset: 0; pointer-events: none; image-rendering: pixelated; opacity: 0; transition: opacity .18s ease-out; }
  #veil.on { opacity: 1; }
  #overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .marker {
    position: absolute; width: 15px; height: 15px; transform: translate(-50%,-50%);
    pointer-events: auto; cursor: pointer;
  }
  .marker--target { width: 19px; height: 19px; }
  .marker__dot {
    width: 15px; height: 15px; border-radius: 50%; border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.5); flex: 0 0 auto;
    display: grid; place-items: center; font-size: 8.5px; font-weight: 700; color: #fff;
    font-family: var(--font-mono);
  }
  /* The tag hangs off the anchored dot instead of sitting in the marker's own box, so
     hiding it during the declutter pass never moves the dot it belongs to. */
  .marker__tag {
    position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%);
    font-family: var(--font-mono); font-size: 9.5px; font-weight: 600; color: #fff;
    background: rgba(6,9,15,.82); border: 1px solid rgba(255,255,255,.2);
    padding: 2px 5px; border-radius: 4px; white-space: nowrap;
  }
  .marker--target .marker__dot {
    width: 19px; height: 19px; background: var(--cat); border-color: #fff; color: var(--on-cat);
  }
  .marker--target .marker__dot::after { content: "★"; font-size: 10px; }
  .marker[hidden] { display: none; }
  .marker__tag[hidden] { display: none; }
  .grid-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .scalebar { position: absolute; left: 14px; bottom: 14px; color: #fff; font-size: 10.5px; text-shadow: 0 1px 3px rgba(0,0,0,.9); }
  .scalebar__bar { height: 6px; border: 2px solid #fff; border-top: none; width: 120px; box-shadow: 0 0 0 1px rgba(0,0,0,.5); }
  .scalebar__label { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .northarrow {
    position: absolute; right: 16px; top: 14px; width: 30px; height: 30px; border-radius: 50%;
    display: grid; place-items: center; color: #fff; background: rgba(6,9,15,.62);
    border: 1px solid rgba(255,255,255,.32); box-shadow: 0 2px 8px rgba(0,0,0,.45);
  }
  .northarrow svg { display: block; }
  .stage-fallback {
    position: absolute; inset: 0; display: none; place-items: center; padding: 32px; text-align: center;
    color: #cbd5e1; font-size: 13px;
  }
  .stage-fallback.on { display: grid; }

  /* --------------------------------------------------------------- inspector */
  .inspector {
    flex: 0 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1px; background: var(--line); border-top: 1px solid var(--line);
  }
  .cell { background: var(--surface); padding: 9px 14px; min-width: 0; }
  .cell__k { font-size: 9.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--quiet); font-weight: 600; }
  .cell__v { font-size: 13px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
  .cell__v--cat { color: var(--cat); }
  .chip { display: inline-flex; align-items: center; gap: 6px; }
  .chip i { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }

  /* -------------------------------------------------------------------- side */
  .side { background: var(--surface); overflow: auto; padding: 18px 18px 28px; display: flex; flex-direction: column; gap: 20px; }
  .side h2 {
    margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: .9px;
    text-transform: uppercase; color: var(--muted);
  }
  .legend { display: flex; flex-direction: column; gap: 2px; }
  .swatch {
    display: grid; grid-template-columns: 16px 1fr auto; align-items: center; gap: 10px;
    width: 100%; text-align: left; padding: 7px 8px; border: 1px solid transparent;
    border-radius: 7px; background: transparent; color: var(--text); font: inherit;
    font-size: 12px; cursor: pointer; transition: background .14s, border-color .14s;
  }
  .swatch:hover { background: var(--line-soft); }
  .swatch[aria-pressed="true"] { border-color: var(--cat); background: color-mix(in srgb, var(--cat) 9%, var(--surface)); }
  .swatch i { width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(15,23,42,.25); }
  .swatch b { font-family: var(--font-mono); font-size: 11px; font-weight: 500; color: var(--muted); }
  .hint { font-size: 11px; color: var(--quiet); margin: 8px 0 0; line-height: 1.5; }
  .facts { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 12px; }
  .facts dt { color: var(--quiet); }
  .facts dd { margin: 0; font-family: var(--font-mono); font-size: 11.5px; overflow-wrap: anywhere; }
  .site-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .site-list li {
    display: grid; grid-template-columns: 20px 1fr auto; align-items: baseline; gap: 9px;
    font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--line-soft);
  }
  .site-list li:last-child { border-bottom: none; }
  .site-list .rank { font-family: var(--font-mono); font-size: 10.5px; color: var(--on-cat); background: var(--cat);
    border-radius: 4px; padding: 1px 0; text-align: center; }
  .site-list .score { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
  .site-list .site-facts { margin-top: 2px; display: flex; flex-direction: column; gap: 1px; }
  .site-list .site-facts div { display: flex; gap: 6px; font-size: 11px; line-height: 1.35; }
  .site-list .site-facts span { color: var(--quiet); }
  .site-list .site-facts b { color: var(--muted); font-weight: 600; }
  .footer {
    flex: 0 0 auto; padding: 10px 26px; font-size: 11px; color: var(--muted);
    background: var(--surface); border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 4px 18px;
  }

  @media (max-width: 900px) {
    /* Below the two-column break the app shell stops being a shell. A viewport-height flex
       column squeezes the stage until the inspector reads the map for itself and pins the
       sidebar to a scroll box that shows half its legend; on a phone the honest layout is a
       normal document that scrolls, with the stage given a height of its own. */
    html, body { height: auto; overflow-x: hidden; }
    body { display: block; }
    .shell { display: block; }
    .stage { height: 58vh; min-height: 300px; }
    .stage-col { border-right: none; border-bottom: 1px solid var(--line); }
    .side { overflow: visible; max-height: none; }
  }
  @media (max-width: 620px) {
    /* min-width:0 on the masthead's flex children: without it the meta row keeps its
       max-content width, the document gains a horizontal overflow, and every row below it
       lays out against that wider canvas instead of the phone. */
    .masthead { padding: 14px 16px; gap: 12px; }
    .mast-brand, .mast-meta, .mast-actions { flex: 1 1 100%; min-width: 0; }
    .mast-actions { width: 100%; }
    .btn { flex: 1 1 auto; justify-content: center; }
    .toolbar { padding: 8px 10px; gap: 6px; }
    .inspector { grid-template-columns: 1fr 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: .01ms !important; }
  }
</style>
</head>
<body>
  <header class="masthead">
    <div class="mast-brand">
      <div class="mast-mark"><img src="{{LOGO}}" alt="SiteSurveyor logo"></div>
      <div>
        <div class="mast-kicker">Classified raster &bull; {{NAME}}</div>
        <h1>Pixel-level view of the <em>{{NAME}}</em> zones</h1>
      </div>
    </div>
    <div class="mast-meta">
      <div><b>Client</b> {{CLIENT}}</div>
      <div><b>Target</b> <span class="mono">{{TARGET}}</span></div>
      <div><b>Grid</b> <span class="mono">{{DIMENSIONS}}</span></div>
      <div><b>Generated</b> <span class="mono">{{GENERATED}}</span></div>
    </div>
    <div class="mast-actions">
      <a class="btn" href="{{REPORT_HREF}}">Category report</a>
      <a class="btn btn--primary" href="{{TIFF_HREF}}" download>Download GeoTIFF</a>
    </div>
  </header>

  <div class="shell">
    <section class="stage-col">
      <div class="toolbar" role="toolbar" aria-label="Raster view controls">
        <button class="tool tool--icon" type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out (−)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6M8 11h6"/></svg>
        </button>
        <button class="tool tool--icon" type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in (+)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6M8 11h6M11 8v6"/></svg>
        </button>
        <button class="tool" type="button" id="zoom-fit" title="Fit to view (0)">Fit</button>
        <span class="zoom-readout mono" id="zoom-value">—</span>
        <span class="spacer"></span>
        <label class="toggle"><input type="checkbox" id="show-sites" checked> Candidate sites</label>
        <label class="toggle"><input type="checkbox" id="show-grid"> 1 km grid</label>
      </div>

      <div class="stage" id="stage" tabindex="0" role="application"
           aria-label="Classified {{NAME}} raster. Drag to pan, scroll or press plus and minus to zoom, and move the pointer over the image to read the value of each 30 metre cell.">
        <div id="plate">
          <img id="raster" src="{{DETAIL}}" alt="Classified {{NAME}} raster, one colour per zone class, {{DIMENSIONS}} cells at {{CELL}} metres." width="{{W}}" height="{{H}}">
          <canvas id="veil" width="{{W}}" height="{{H}}"></canvas>
        </div>
        <div id="overlay">
          <svg class="grid-svg" id="grid" aria-hidden="true"></svg>
          <div class="northarrow" id="north" aria-hidden="true" title="North">
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 18H4z" fill="currentColor"/></svg>
          </div>
          <div class="scalebar" id="scalebar" aria-hidden="true"><div class="scalebar__bar" id="scalebar-bar"></div><div class="scalebar__label" id="scalebar-label">—</div></div>
        </div>
        <div class="stage-fallback" id="fallback">
          <p>{{NO_IMAGE}}</p>
        </div>
      </div>

      <div class="inspector" aria-live="polite">
        <div class="cell"><div class="cell__k">Cell</div><div class="cell__v mono" id="i-cell">—</div></div>
        <div class="cell"><div class="cell__k">Zone class</div><div class="cell__v" id="i-class">—</div></div>
        <div class="cell"><div class="cell__k">{{INDEX_LABEL}}</div><div class="cell__v cell__v--cat mono" id="i-score">—</div></div>
        <div class="cell"><div class="cell__k">Latitude / Longitude</div><div class="cell__v mono" id="i-latlon">—</div></div>
        <div class="cell"><div class="cell__k">UTM E / N</div><div class="cell__v mono" id="i-utm">—</div></div>
        <div class="cell"><div class="cell__k">From target</div><div class="cell__v mono" id="i-dist">—</div></div>
      </div>
    </section>

    <aside class="side">
      <div>
        <h2>Zone legend</h2>
        <div class="legend" id="legend"></div>
        <p class="hint">Select a class to isolate it on the raster. Colours are the same as the map legend in the category report.</p>
      </div>
      <div>
        <h2>Raster</h2>
        <dl class="facts">
          <dt>Source</dt><dd>{{TIFF_NAME}}</dd>
          <dt>Cells</dt><dd>{{W}} × {{H}}</dd>
          <dt>Pixel size</dt><dd>{{CELL}}</dd>
          <dt>CRS</dt><dd>{{CRS_LABEL}}</dd>
          <dt>Extent</dt><dd>{{EXTENT}}</dd>
          <dt>No data</dt><dd>{{NODATA_SHARE}}</dd>
          <dt>Inputs</dt><dd>{{SOURCES}}</dd>
        </dl>
      </div>
      <div>
        <h2>Ranked {{CAND_NOUN}} sites</h2>
        <ul class="site-list" id="sites"></ul>
        <p class="hint" id="sites-empty" hidden>No site cleared the screening threshold for this category.</p>
      </div>
      <div>
        <h2>Natural breaks</h2>
        <dl class="facts" id="breaks"></dl>
        <p class="hint">Class edges come from Jenks natural breaks on this survey's own index, so two surveys are not comparable.</p>
      </div>
    </aside>
  </div>

  <footer class="footer">
    <span><strong>{{NAME}}</strong> classified raster &bull; screening-level zoning</span>
    <span>{{CLIENT}}</span>
    <span>Produced by {{ANALYST}} &bull; An Eineva Labs product</span>
  </footer>

<script>
(function () {
  "use strict";
  var DATA = __DATA_JSON__;
  var W = DATA.width, H = DATA.height;
  var stage = document.getElementById("stage");
  var plate = document.getElementById("plate");
  var img = document.getElementById("raster");
  var overlay = document.getElementById("overlay");
  var veil = document.getElementById("veil");
  var fallback = document.getElementById("fallback");

  var view = { scale: 1, x: 0, y: 0, fit: 1 };
  var keys = { cls: null, score: null };
  var isolated = null;
  var markers = [];

  /* ---------------------------------------------------------- key bitmaps */
  function readKey(src, done) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, W, H);
      try { done(ctx.getImageData(0, 0, W, H)); } catch (err) { done(null); }
    };
    im.onerror = function () { done(null); };
    im.src = src;
  }
  readKey(DATA.class_key, function (d) { keys.cls = d; });
  if (DATA.score_key) { readKey(DATA.score_key, function (d) { keys.score = d; }); }

  img.onerror = function () {
    fallback.classList.add("on");
    fallback.querySelector("p").textContent = DATA.no_image_message;
  };

  /* -------------------------------------------------------------- layout */
  function measure() {
    var r = stage.getBoundingClientRect();
    var pad = 24;
    view.fit = Math.min((r.width - pad) / W, (r.height - pad) / H);
    if (!isFinite(view.fit) || view.fit <= 0) { view.fit = 1; }
  }
  function apply() {
    plate.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.scale + ")";
    veil.style.width = W + "px";
    veil.style.height = H + "px";
    place();
    document.getElementById("zoom-value").textContent =
      Math.round(view.scale * 100) + "% · " + (DATA.cell_m / view.scale).toFixed(1) + " m per px";
    drawScale();
    drawGrid();
  }
  function clamp() {
    var r = stage.getBoundingClientRect();
    view.x = clampAxis(view.x, W * view.scale, r.width);
    view.y = clampAxis(view.y, H * view.scale, r.height);
  }
  function clampAxis(pos, size, avail) {
    // Zoomed in, the plate may pan only as far as its own edges: [avail - size, 0].
    // The old bounds inverted once the image outgrew the stage (min > max), so every
    // zoom and drag collapsed onto the far edge instead of holding the focal point.
    // Smaller than the stage, it simply stays centred - there is nothing to pan.
    if (size <= avail) { return (avail - size) / 2; }
    return Math.min(0, Math.max(avail - size, pos));
  }
  function center() {
    var r = stage.getBoundingClientRect();
    view.x = (r.width - W * view.scale) / 2;
    view.y = (r.height - H * view.scale) / 2;
  }
  function setScale(next, anchor) {
    var prev = view.scale;
    view.scale = Math.max(view.fit * 0.5, Math.min(16, next));
    var r = stage.getBoundingClientRect();
    // The point under the cursor holds still; buttons and keys have no cursor, so they
    // zoom about the middle of the stage rather than flinging the view back to centre.
    var ax = anchor ? anchor.x - r.left : r.width / 2;
    var ay = anchor ? anchor.y - r.top : r.height / 2;
    view.x = ax - (ax - view.x) * (view.scale / prev);
    view.y = ay - (ay - view.y) * (view.scale / prev);
    clamp();
    apply();
  }

  /* ------------------------------------------------------------ overlays */
  function toScreen(col, row) {
    return { x: view.x + col * view.scale, y: view.y + row * view.scale };
  }
  function place() {
    var shown = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var p = toScreen(m.col, m.row);
      var visible = p.x > -60 && p.y > -40 && p.x < stage.clientWidth + 60 && p.y < stage.clientHeight + 40;
      m.node.hidden = !visible;
      m.node.style.left = p.x + "px";
      m.node.style.top = p.y + "px";
      if (visible && m.tag) {
        // Cleared before the declutter measures: a label still hidden from the previous
        // pass reports a zero rect, so it can never collide with anything and both it and
        // the label it overlaps stay on screen.
        m.tag.hidden = false;
        shown.push(m);
      }
    }
    /* Positions are all written before any is measured, so the declutter pass below reads a
       settled layout instead of thrashing one reflow per marker. A label is dropped when it
       would cover another marker's dot, a label already kept, or the scale bar and north
       arrow: eight ranked sites inside a kilometre of each other otherwise stack into one
       unreadable block right where the reader is looking. */
    var taken = overlayChrome();
    var dots = shown.map(rectOfDot);
    for (var j = 0; j < shown.length; j++) {
      var s = shown[j];
      var box = rectOf(s.tag);
      var clash = taken.some(function (r) { return hits(box, r); }) ||
        dots.some(function (r, k) { return k !== j && hits(box, r); });
      s.tag.hidden = clash;
      if (!clash) { taken.push(box); }
    }
  }
  function rectOfDot(m) { return rectOf(m.dot); }
  function rectOf(node) {
    var o = stage.getBoundingClientRect();
    var r = node.getBoundingClientRect();
    return { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top };
  }
  function hits(a, b) {
    // A few pixels of slack: candidates that sit within a kilometre of each other land
    // 7-10 px apart on screen, and a label that merely touches a dot reads as buried in it.
    var pad = 3;
    return !(a.right + pad < b.left || a.left - pad > b.right ||
             a.bottom + pad < b.top || a.top - pad > b.bottom);
  }
  function overlayChrome() {
    return [document.getElementById("scalebar"), document.getElementById("north")].map(rectOf);
  }
  function drawScale() {
    var bar = document.getElementById("scalebar-bar");
    var label = document.getElementById("scalebar-label");
    // One raster cell is DATA.cell_m metres on the ground and view.scale pixels on screen,
    // so the screen cost of a metre is scale / cell_m — not the other way round.
    var px_per_m = view.scale / DATA.cell_m;
    var metres = 118 / px_per_m;
    var pow = Math.pow(10, Math.floor(Math.log(metres) / Math.LN10));
    var nice = [1, 2, 5, 10].map(function (k) { return k * pow; }).reduce(function (a, b) {
      return Math.abs(b - metres) < Math.abs(a - metres) ? b : a;
    });
    bar.style.width = Math.max(28, Math.min(240, nice * px_per_m)) + "px";
    var km = nice / 1000;
    label.textContent = nice >= 1000 ? (km % 1 ? km.toFixed(1) : km) + " km" : nice + " m";
  }
  function drawGrid() {
    var svg = document.getElementById("grid");
    if (!document.getElementById("show-grid").checked) { svg.textContent = ""; return; }
    var perKm = 1000 / DATA.cell_m;
    var stepPx = perKm * view.scale;
    if (stepPx < 18) { svg.textContent = ""; return; }
    var ns = "http://www.w3.org/2000/svg";
    svg.textContent = "";
    var maxX = Math.ceil(stage.clientWidth / stepPx);
    var maxY = Math.ceil(stage.clientHeight / stepPx);
    var startCol = Math.max(0, Math.floor(-view.x / stepPx));
    var endCol = Math.min(Math.ceil(W / perKm), maxX + startCol);
    for (var c = startCol; c <= endCol; c++) {
      var ln = document.createElementNS(ns, "line");
      ln.setAttribute("x1", view.x + c * stepPx); ln.setAttribute("x2", view.x + c * stepPx);
      ln.setAttribute("y1", 0); ln.setAttribute("y2", stage.clientHeight);
      ln.setAttribute("stroke", "rgba(255,255,255,.26)");
      ln.setAttribute("stroke-dasharray", "3 5");
      svg.appendChild(ln);
    }
    var startRow = Math.max(0, Math.floor(-view.y / stepPx));
    var endRow = Math.min(Math.ceil(H / perKm), maxY + startRow);
    for (var rw = startRow; rw <= endRow; rw++) {
      var ln2 = document.createElementNS(ns, "line");
      ln2.setAttribute("y1", view.y + rw * stepPx); ln2.setAttribute("y2", view.y + rw * stepPx);
      ln2.setAttribute("x1", 0); ln2.setAttribute("x2", stage.clientWidth);
      ln2.setAttribute("stroke", "rgba(255,255,255,.26)");
      ln2.setAttribute("stroke-dasharray", "3 5");
      svg.appendChild(ln2);
    }
  }

  function buildMarkers() {
    if (DATA.target) {
      markers.push({ col: DATA.target.col, row: DATA.target.row, target: true });
    }
    (DATA.sites || []).forEach(function (s) {
      markers.push({ col: s.col, row: s.row, rank: s.rank, site: s });
    });
    markers.forEach(function (m) {
      var node = document.createElement("div");
      node.className = "marker" + (m.target ? " marker--target" : "");
      var dot = document.createElement("span");
      dot.className = "marker__dot";
      if (!m.target) {
        dot.style.background = m.site.color;
        dot.textContent = String(m.rank);
      }
      node.appendChild(dot);
      m.dot = dot;
      var tag = document.createElement("span");
      tag.className = "marker__tag";
      tag.textContent = m.target
        ? "Client target"
        : "#" + m.rank + " · " + m.site.score.toFixed(1) + "/100 · " + m.site.dist_km + " km";
      node.appendChild(tag);
      m.tag = tag;
      node.title = (m.target ? "Client target" : "Ranked site #" + m.rank) +
        (m.site && m.site.facts && m.site.facts.length
          ? " — " + m.site.facts.map(function (f) { return f[0] + ": " + f[1]; }).join("; ")
          : "") +
        " — click the image to copy its coordinates";
      node.addEventListener("mouseenter", function () { flyTo(m.col, m.row); });
      overlay.appendChild(node);
      m.node = node;
    });
  }

  /* ------------------------------------------------------------- legend */
  function pctText(p) {
    // A class holding a few cells is still a class: 0.0% reads as "not present on this map".
    if (p <= 0) { return "0%"; }
    if (p < 0.05) { return "<0.1%"; }
    return p.toFixed(1) + "%";
  }
  function buildLegend() {
    var host = document.getElementById("legend");
    DATA.legend.forEach(function (row) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<i style="background:' + row.color + '"></i><span></span><b></b>';
      b.querySelector("span").textContent = row.label;
      b.querySelector("b").textContent = pctText(row.pct);
      b.title = row.count.toLocaleString() + " cells · select to isolate this class";
      b.dataset.code = String(row.code);
      b.addEventListener("click", function () {
        setIsolation(isolated === row.code ? null : row.code);
      });
      host.appendChild(b);
    });
  }
  function setIsolation(code) {
    isolated = code;
    Array.prototype.forEach.call(document.getElementById("legend").children, function (s) {
      s.setAttribute("aria-pressed", String(code !== null && Number(s.dataset.code) === code));
    });
    paintVeil();
  }
  function paintVeil() {
    var ctx = veil.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (isolated === null || !keys.cls) { veil.classList.remove("on"); return; }
    var out = ctx.createImageData(W, H);
    var src = keys.cls.data;
    for (var i = 0; i < src.length; i += 4) {
      var same = src[i] === isolated;
      out.data[i] = 6; out.data[i + 1] = 9; out.data[i + 2] = 15;
      out.data[i + 3] = same ? 0 : 218;
    }
    ctx.putImageData(out, 0, 0);
    veil.classList.add("on");
  }

  function buildSites() {
    var ul = document.getElementById("sites");
    if (!DATA.sites || !DATA.sites.length) {
      document.getElementById("sites-empty").hidden = false;
      return;
    }
    DATA.sites.forEach(function (s) {
      var li = document.createElement("li");
      var rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(s.rank);
      var body = document.createElement("span");
      body.textContent = s.label;
      var small = document.createElement("div");
      small.className = "mono";
      small.style.fontSize = "10.5px";
      small.style.color = "var(--quiet)";
      small.textContent = s.lat.toFixed(5) + ", " + s.lon.toFixed(5) + " · " + s.dist_km + " km";
      body.appendChild(small);
      if (s.facts && s.facts.length) {
        var field = document.createElement("div");
        field.className = "mono site-facts";
        s.facts.forEach(function (f) {
          var line = document.createElement("div");
          var key = document.createElement("span");
          // The parenthetical carries the method, which the table header and the tooltip
          // both hold; in a three-line list slot it only costs a wrap.
          key.textContent = f[0].split(" (")[0];
          var val = document.createElement("b");
          val.textContent = f[1];
          line.appendChild(key); line.appendChild(val);
          field.appendChild(line);
        });
        body.appendChild(field);
      }
      var score = document.createElement("span");
      score.className = "score";
      score.textContent = s.score.toFixed(1);
      li.appendChild(rank); li.appendChild(body); li.appendChild(score);
      li.addEventListener("mouseenter", function () { flyTo(s.col, s.row); });
      ul.appendChild(li);
    });
  }
  function buildBreaks() {
    var dl = document.getElementById("breaks");
    (DATA.breaks || []).forEach(function (b, i) {
      var dt = document.createElement("dt");
      dt.textContent = "Break " + (i + 1);
      var dd = document.createElement("dd");
      dd.textContent = b.toFixed(1);
      dl.appendChild(dt); dl.appendChild(dd);
    });
    if (!dl.children.length) {
      var dt = document.createElement("dt");
      dt.textContent = "Breaks";
      var dd = document.createElement("dd");
      dd.textContent = "not recorded";
      dl.appendChild(dt); dl.appendChild(dd);
    }
  }
  function flyTo(col, row) {
    var r = stage.getBoundingClientRect();
    view.scale = Math.max(view.scale, Math.min(8, view.fit * 3));
    view.x = r.width / 2 - col * view.scale;
    view.y = r.height / 2 - row * view.scale;
    clamp();
    apply();
  }

  /* ------------------------------------------------------------ reading */
  function pixelAt(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    var col = Math.floor((clientX - r.left - view.x) / view.scale);
    var row = Math.floor((clientY - r.top - view.y) / view.scale);
    if (col < 0 || row < 0 || col >= W || row >= H) { return null; }
    return { col: col, row: row };
  }
  function lonlatOf(col, row) {
    var cs = DATA.cols, rs = DATA.rows, g = DATA.grid;
    var fc = Math.min(Math.max(col - 0.5, 0), cs[cs.length - 1]);
    var fr = Math.min(Math.max(row - 0.5, 0), rs[rs.length - 1]);
    var i = 0; while (i < cs.length - 2 && cs[i + 1] < fc) { i++; }
    var j = 0; while (j < rs.length - 2 && rs[j + 1] < fr) { j++; }
    var tx = (fc - cs[i]) / (cs[i + 1] - cs[i] || 1);
    var ty = (fr - rs[j]) / (rs[j + 1] - rs[j] || 1);
    var a = g[j][i], b = g[j][i + 1], c = g[j + 1][i], d = g[j + 1][i + 1];
    return {
        lon: (a[0] * (1 - tx) + b[0] * tx) * (1 - ty) + (c[0] * (1 - tx) + d[0] * tx) * ty,
        lat: (a[1] * (1 - tx) + b[1] * tx) * (1 - ty) + (c[1] * (1 - tx) + d[1] * tx) * ty
    };
  }
  function classOf(code) {
    for (var i = 0; i < DATA.legend.length; i++) {
      if (DATA.legend[i].code === code) { return DATA.legend[i]; }
    }
    return null;
  }
  function set(field, value) { document.getElementById(field).textContent = value; }
  function inspect(clientX, clientY) {
    var p = pixelAt(clientX, clientY);
    if (!p) { clearInspector(); return; }
    var cls = keys.cls ? keys.cls.data[(p.row * W + p.col) * 4] : null;
    var sc = keys.score ? keys.score.data[(p.row * W + p.col) * 4] : null;
    set("i-cell", "col " + p.col + " · row " + p.row);
    var row = classOf(cls);
    var host = document.getElementById("i-class");
    host.textContent = "";
    if (row) {
      var chip = document.createElement("span");
      chip.className = "chip";
      var sw = document.createElement("i");
      sw.style.background = row.color;
      chip.appendChild(sw);
      var t = document.createElement("span");
      t.textContent = row.label;
      chip.appendChild(t);
      host.appendChild(chip);
    } else {
      host.textContent = cls === null ? "loading…" : "unknown";
    }
    set("i-score", (cls === DATA.nodata || sc === null) ? "—" : sc + " / 100");
    var ll = lonlatOf(p.col, p.row);
    set("i-latlon", ll.lat.toFixed(5) + ", " + ll.lon.toFixed(5));
    var e = DATA.xmin + (p.col + 0.5) * DATA.cell_m;
    var n = DATA.ymax - (p.row + 0.5) * DATA.cell_m;
    set("i-utm", Math.round(e).toLocaleString() + " E, " + Math.round(n).toLocaleString() + " N");
    if (DATA.target) {
      var dx = (p.col + 0.5) - DATA.target.col, dy = (p.row + 0.5) - DATA.target.row;
      set("i-dist", (Math.sqrt(dx * dx + dy * dy) * DATA.cell_m / 1000).toFixed(2) + " km");
    } else { set("i-dist", "—"); }
  }
  function clearInspector() {
    ["i-cell", "i-score", "i-latlon", "i-utm", "i-dist"].forEach(function (id) { set(id, "—"); });
    document.getElementById("i-class").textContent = "—";
  }

  /* ------------------------------------------------------------- events */
  var dragging = false, last = null, moved = 0;
  stage.addEventListener("pointerdown", function (ev) {
    dragging = true; moved = 0; last = { x: ev.clientX, y: ev.clientY };
    stage.classList.add("is-panning");
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener("pointermove", function (ev) {
    if (dragging && last) {
      var dx = ev.clientX - last.x, dy = ev.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      view.x += dx; view.y += dy; last = { x: ev.clientX, y: ev.clientY };
      clamp(); apply();
    }
    inspect(ev.clientX, ev.clientY);
  });
  function endDrag(ev) {
    if (!dragging) { return; }
    dragging = false; last = null;
    stage.classList.remove("is-panning");
    if (stage.releasePointerCapture && ev.pointerId !== undefined) {
      try { stage.releasePointerCapture(ev.pointerId); } catch (err) { /* already gone */ }
    }
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("pointerleave", function () { clearInspector(); });
  stage.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    setScale(view.scale * (ev.deltaY < 0 ? 1.18 : 1 / 1.18), { x: ev.clientX, y: ev.clientY });
  }, { passive: false });
  stage.addEventListener("click", function (ev) {
    if (moved > 4) { return; }
    var p = pixelAt(ev.clientX, ev.clientY);
    if (!p) { return; }
    if (keys.cls) { setIsolation(keys.cls.data[(p.row * W + p.col) * 4]); }
    var ll = lonlatOf(p.col, p.row);
    var pair = ll.lat.toFixed(6) + ", " + ll.lon.toFixed(6);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pair)
        .then(function () { set("i-dist", "copied " + pair); })
        .catch(function () { set("i-latlon", pair); });
    }
  });
  stage.addEventListener("keydown", function (ev) {
    var step = 40;
    if (ev.key === "+" || ev.key === "=") { setScale(view.scale * 1.25); ev.preventDefault(); }
    else if (ev.key === "-" || ev.key === "_") { setScale(view.scale / 1.25); ev.preventDefault(); }
    else if (ev.key === "0") { measure(); setScale(view.fit); ev.preventDefault(); }
    else if (ev.key === "ArrowLeft") { view.x += step; clamp(); apply(); ev.preventDefault(); }
    else if (ev.key === "ArrowRight") { view.x -= step; clamp(); apply(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { view.y += step; clamp(); apply(); ev.preventDefault(); }
    else if (ev.key === "ArrowDown") { view.y -= step; clamp(); apply(); ev.preventDefault(); }
  });
  document.getElementById("zoom-in").addEventListener("click", function () { setScale(view.scale * 1.4); });
  document.getElementById("zoom-out").addEventListener("click", function () { setScale(view.scale / 1.4); });
  document.getElementById("zoom-fit").addEventListener("click", function () { measure(); setScale(view.fit); });
  document.getElementById("show-sites").addEventListener("change", function (ev) {
    var hidden = ev.target.checked ? "" : "none";
    markers.forEach(function (m) { m.node.style.display = hidden; });
  });
  document.getElementById("show-grid").addEventListener("change", drawGrid);
  window.addEventListener("resize", function () { measure(); center(); apply(); });

  /* --------------------------------------------------------------- start */
  function start() {
    if (start.done) { return; }
    start.done = true;
    measure();
    view.scale = view.fit;
    center();
    buildLegend();
    buildSites();
    buildBreaks();
    buildMarkers();
    apply();
  }
  img.addEventListener("load", start);
  if (img.complete && img.naturalWidth) { start(); }
})();
</script>
</body>
</html>
"""
# ---------------------------------------------------------------------------
# Reading what a category holds
# ---------------------------------------------------------------------------
def get(key: str) -> Category:
    """The category a caller named, or None for anything else."""
    return CATEGORIES.get((key or "").strip().lower())


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    f = float(value)
    # A summary can carry float("inf") as an open-ended limit; it must never reach a
    # reader as the word "inf".
    return f if math.isfinite(f) else None


def _json_block(path: Path) -> tuple[dict | None, str]:
    if not path.exists():
        return None, "absent"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, f"unreadable ({type(exc).__name__})"
    return (data, "present") if isinstance(data, dict) else (None, "unexpected structure")


def candidates_of(cat: Category, data: dict) -> list[dict]:
    rows = data.get(cat.candidates_key) or []
    return [r for r in rows if isinstance(r, dict)]


def headline_of(cat: Category, data: dict) -> dict:
    """The two numbers the category is judged on, read the way the dossier reads them.

    Hazard is the awkward one: its summary scores the target cell for hazard (lower is
    safer) and separately for safety, so the headline carries both rather than pretending
    one number does both jobs.
    """
    assess = data.get("target_assessment") if isinstance(data.get("target_assessment"), dict) else {}
    score_key, class_key = cat.score_labels
    if assess:
        score = assess.get(score_key)
        klass = assess.get(class_key)
        parcel = assess.get("parcel_mean_150m", assess.get("local_150m_mean_hazard"))
        parcel_class = assess.get("parcel_class_150m", assess.get("local_150m_hazard_class"))
        extra = {
            k: v for k, v in assess.items()
            if k not in (score_key, class_key, "parcel_mean_150m", "parcel_class_150m",
                         "local_150m_mean_hazard", "local_150m_hazard_class",
                         # Hazard quotes safety as the headline, so it is not a second fact.
                         "safety_index_score")
            and not isinstance(v, dict)
        }
        breakdown = assess.get("sub_hazard_breakdown") or {}
    else:
        score = data.get(score_key)
        klass = data.get(class_key)
        parcel = data.get("local_150m_mean_score")
        parcel_class = data.get("local_150m_class")
        extra, breakdown = {}, {}
    safety = _number(assess.get("safety_index_score")) if cat.hazard_raster else None
    return {
        "score": _number(score),
        "klass": klass,
        "parcel_score": _number(parcel),
        "parcel_class": parcel_class,
        "safety_score": safety,
        "indicators": extra,
        "breakdown": breakdown if isinstance(breakdown, dict) else {},
    }


def band(value, lower_is_better: bool = False) -> str:
    """One colour per score band, dark enough to hold white type and to read as text."""
    v = _number(value)
    if v is None:
        return "#475569"
    if lower_is_better:
        if v <= 30:
            return "#047857"
        if v <= 50:
            return "#92400e"
        return "#b91c1c"
    if v >= 75:
        return "#047857"
    if v >= 55:
        return "#92400e"
    if v >= 40:
        return "#9a3412"
    return "#b91c1c"


def report_path(cat: Category) -> Path:
    return cfg.OUT / f"{cat.slug}_report.html"


def viewer_path(cat: Category) -> Path:
    return cfg.OUT / f"{cat.slug}_raster_viewer.html"


def _newer(a: Path | None, b: Path | None) -> bool:
    """True when ``a`` was written after ``b`` (or ``b`` does not exist)."""
    if a is None or not a.exists():
        return False
    if b is None or not b.exists():
        return True
    try:
        return a.stat().st_mtime > b.stat().st_mtime
    except OSError:
        return True


def category_state(key: str) -> dict:
    """Everything one category export can offer, with the size of each file.

    The panel needs more than "does the file exist": a survey that ran one category and
    failed another has to show which line is available and why the rest is not, and an
    artefact that is stale behind its summary is regenerated on read, not served dead.
    """
    cat = get(key)
    if cat is None:
        raise KeyError(key)
    data, status = _load_category(cfg.OUT / cat.summary_file)
    files: dict[str, dict] = {}

    def register(name: str, filename: str, kind: str) -> None:
        path = cfg.OUT / filename
        entry = {"file": filename, "kind": kind, "exists": path.exists()}
        if entry["exists"]:
            entry["bytes"] = path.stat().st_size
        files[name] = entry

    for index, (filename, _, _) in enumerate(cat.maps):
        register(f"map_{index}", filename, "map")
    register("zones_raster", cat.zones_tif, "raster")
    register("index_raster", cat.index_tif, "raster")
    for ext in ("csv", "geojson", "kml", "kmz"):
        register(ext, f"{cat.vector_base}.{ext}", "vector")

    html = report_path(cat)
    viewer = viewer_path(cat)
    maps_present = [f for f in files.values() if f["kind"] == "map" and f["exists"]]
    raster_ok = files["zones_raster"]["exists"]

    out = {
        "key": cat.key,
        "slug": cat.slug,
        "name": cat.name,
        "short": cat.short,
        "hue": cat.hue,
        "accent": cat.accent,
        "status": status,
        "available": data is not None,
        "verification": cat.verification,
        "candidate_noun": cat.candidate_noun,
        "report": {
            "file": html.name, "exists": html.exists(),
            "bytes": html.stat().st_size if html.exists() else 0,
            "url": f"/api/report/{cat.key}",
        },
        "viewer": {
            "file": viewer.name, "exists": viewer.exists(),
            "bytes": viewer.stat().st_size if viewer.exists() else 0,
            "url": f"/api/raster/{cat.key}",
            "raster_available": raster_ok,
        },
        "bundle": {"url": f"/api/export/{cat.key}", "formats": ["csv", "geojson", "kml", "kmz"]},
        "files": files,
        "maps_ready": len(maps_present),
        "headline": None,
        "candidates": 0,
        "top_candidate": None,
        "identity": None,
    }

    if data is None:
        return out

    ranked = candidates_of(cat, data)
    identity = _survey_identity([data])
    out["headline"] = headline_of(cat, data)
    out["candidates"] = len(ranked)
    out["identity"] = identity
    if ranked:
        best = ranked[0]
        out["top_candidate"] = {
            "latitude": _number(best.get("latitude")),
            "longitude": _number(best.get("longitude")),
            "distance_km": _number(best.get("distance_from_target_km")),
            "score": _number(best.get("potential_score")),
            "class_name": best.get("class_name"),
        }
    return out


def inventory() -> dict:
    """All four categories plus the cross-category artefacts."""
    categories = [category_state(key) for key in CATEGORY_ORDER]
    ran = [c for c in categories if c["available"]]
    master = cfg.OUT / "master_site_dossier.json"
    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "categories": categories,
        "surveyed": bool(ran),
        "categories_complete": len(ran),
        "identity": next((c["identity"] for c in ran if c["identity"]), None),
        "master": {
            "dossier": {"file": master.name, "exists": master.exists(),
                        "bytes": master.stat().st_size if master.exists() else 0,
                        "url": "/api/dossier"},
        },
    }


# ---------------------------------------------------------------------------
# The single-category client report
# ---------------------------------------------------------------------------
def _fmt_score(value) -> str:
    v = _number(value)
    return "N/A" if v is None else f"{v:.1f}".rstrip("0").rstrip(".")


def _fmt_out_of(value) -> str:
    v = _number(value)
    return "N/A" if v is None else f"{_fmt_score(v)}/100"


def _fmt_distance(value) -> str:
    v = _number(value)
    return "N/A" if v is None else f"{v:.2f} km"


def _fmt_coord(value, digits: int = 5) -> str:
    v = _number(value)
    return "N/A" if v is None else f"{v:.{digits}f}"


def _fmt_label(value, fallback: str = "Not classified") -> str:
    return _e(str(value)) if value else fallback


def _detail_cell(col: DetailColumn, item: dict) -> str:
    """Render one field number for a ranked site, the same way in every surface that shows it."""
    values = [_number(item.get(key)) for key in col.keys]
    if col.fmt == "range_m":
        low, high = values[0], values[1] if len(values) > 1 else None
        if low is None and high is None:
            return "N/A"
        if low is None:
            return f"up to {_fmt_score(high)} m"
        if high is None:
            return f"from {_fmt_score(low)} m"
        if low == high:
            return f"{_fmt_score(low)} m"
        return f"{_fmt_score(low)}–{_fmt_score(high)} m"
    if col.fmt in ("m", "deg", "pct"):
        v = values[0]
        if v is None:
            return "N/A"
        return f"{_fmt_score(v)}" + {"m": " m", "deg": "°", "pct": "%"}[col.fmt]
    raw = item.get(col.keys[0])
    return _e(str(raw)) if raw else "N/A"


def _detail_cells(cat: Category, item: dict) -> list[tuple[str, str]]:
    """Label/value pairs for one site, empty where the survey did not measure the field."""
    return [(col.label, text) for col in cat.detail_columns
            if (text := _detail_cell(col, item)) != "N/A"]


def _assessment_of(data: dict) -> dict:
    assess = data.get("target_assessment")
    return assess if isinstance(assess, dict) else {}


def _short_class(value) -> str:
    """Drop the advice clause from a class name.

    Hazard classes read "Moderate Hazard (Precautions Advised)"; kept whole inside a score
    line it nests a second pair of parentheses around itself. The advice belongs on the
    headline badge, where it has room.
    """
    return _e(str(value).split(" (")[0]) if value else ""


def _sentence(text: str) -> str:
    """Drop a phrase into the middle of a sentence without flattening its acronyms.

    ``"Vertical Electrical Sounding (VES)"`` lowercased whole reads "(ves)", which is how
    the disclaimer used to print it.
    """
    esc = _e(text)
    return esc[:1].lower() + esc[1:] if esc else esc


def _fmt_bytes(value) -> str:
    v = _number(value)
    if v is None:
        return "—"
    units = ["B", "KB", "MB", "GB"]
    i = 0
    while v >= 1024 and i < len(units) - 1:
        v /= 1024.0
        i += 1
    return f"{v:.1f} {units[i]}" if i else f"{int(v)} B"


_ACRONYMS = {"twi", "ndvi", "ndwi", "evi", "sar", "utm", "api", "kmz", "csv", "tif", "ves"}

_INDICATOR_LABELS = {
    "slope_degrees": "Slope (degrees)",
    "twi": "TWI (topographic wetness)",
    "lineament_density_pct": "Lineament density (%)",
    "intersection_density_pct": "Lineament intersections (%)",
    "iron_oxide_residual_pct": "Iron-oxide alteration (%)",
    "hydroxyl_clay_residual_pct": "Hydroxyl/clay alteration (%)",
    "ferrous_mafic_pct": "Ferrous/mafic fraction (%)",
    "relative_relief_pct": "Relative relief (%)",
    "endowment_context_pct": "Regional endowment context (%)",
    "ndvi": "NDVI (vegetation)",
    "rainfall_mm_month": "Rainfall (mm per month)",
    "elevation_m": "Elevation (m)",
    "height_above_channel_m": "Rise above valley floor (m)",
    "depth_to_water_wet_m": "Depth to water, wet season (m)",
    "depth_to_water_dry_m": "Depth to water, dry season (m)",
    "overburden_min_m": "Cover to fresh rock, thin end (m)",
    "overburden_max_m": "Cover to fresh rock, thick end (m)",
    "test_hole_depth_m": "First test hole (m)",
}


def _weight_name(key: str) -> str:
    if key in _INDICATOR_LABELS:
        return _INDICATOR_LABELS[key]
    words = key.replace("_", " ").strip().split(" ")
    return " ".join(w.upper() if w.lower() in _ACRONYMS else w.capitalize() for w in words)


def _logo_data_uri() -> str:
    path = Path(__file__).resolve().parent / "static" / "logo.svg"
    if not path.exists():
        return "/logo.svg"
    import base64
    try:
        return "data:image/svg+xml;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception:
        return "/logo.svg"


REPORT_CSS = """
  :root {
    --font-sans: 'Inter', 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
    --brand: #D14141;
    --bg: #f8fafc;
    --surface: #ffffff;
    --line: #e2e8f0;
    --line-soft: #f1f5f9;
    --text: #0f172a;
    --muted: #64748b;
    --quiet: #475569;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans);
    line-height: 1.6; -webkit-text-size-adjust: 100%; -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  .header {
    background: #090d16; border-top: 4px solid var(--cat); border-bottom: 1px solid rgba(255,255,255,.08);
    color: #fff; padding: 34px 48px;
  }
  .header-inner { max-width: 1180px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 24px;
    align-items: center; justify-content: space-between; }
  .header-brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .brand-mark { width: 46px; height: 46px; border-radius: 8px; background: #111625;
    border: 1px solid rgba(255,255,255,.14); display: grid; place-items: center; padding: 8px; flex: 0 0 auto; }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
  .subtitle { font-size: 11.5px; letter-spacing: .9px; text-transform: uppercase; color: #94a3b8; font-weight: 600; }
  .header h1 { margin: 5px 0 0; font-size: 24px; font-weight: 700; letter-spacing: -.5px; color: #fff;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .header-badge { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .8px;
    text-transform: uppercase; color: #fff; background: var(--cat); padding: 3px 8px; border-radius: 4px; }
  .header-client { background: #111625; border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
    padding: 12px 18px; font-size: 12.5px; color: #cbd5e1; }
  .header-client strong { color: #fff; }

  .meta-bar { background: #fff; border-bottom: 1px solid var(--line); padding: 13px 48px; display: flex;
    flex-wrap: wrap; justify-content: center; gap: 10px 26px; font-size: 12.5px; color: var(--muted); }
  .meta-item strong { color: var(--text); font-weight: 600; margin-right: 4px; }
  .meta-item span { font-family: var(--font-mono); color: var(--cat); }

  .container { max-width: 1180px; margin: 30px auto; padding: 0 24px; }
  .section-title { font-size: 17.5px; font-weight: 700; letter-spacing: -.3px; margin: 34px 0 14px;
    padding-bottom: 8px; border-bottom: 2px solid var(--cat); }
  .note { font-size: 12px; color: var(--quiet); background: var(--line-soft); border: 1px solid var(--line);
    border-radius: 6px; padding: 10px 14px; margin: -2px 0 16px; }

  /* verdict */
  .verdict { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(0,1fr); gap: 18px; margin-bottom: 8px; }
  .verdict__score { background: var(--surface); border: 1px solid var(--line); border-top: 4px solid var(--cat);
    border-radius: 10px; padding: 24px 26px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .verdict__label { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
  .verdict__big { font-family: var(--font-mono); font-size: 58px; font-weight: 700; line-height: 1; margin: 8px 0 10px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px;
    font-weight: 600; color: #fff; }
  .verdict__facts { margin: 18px 0 0; display: grid; gap: 8px; }
  .fact { display: grid; grid-template-columns: 148px 1fr; gap: 12px; font-size: 12.5px;
    border-top: 1px solid var(--line); padding-top: 8px; }
  .fact dt { color: var(--muted); margin: 0; }
  .fact dd { margin: 0; font-weight: 600; }
  .verdict__limit { background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
    padding: 22px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .verdict__limit h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
  .verdict__limit p { margin: 0 0 14px; font-size: 13px; color: var(--text); }
  .verdict__limit p:last-child { margin-bottom: 0; }
  .limit-yes { color: #047857; font-weight: 600; }
  .limit-no { color: #b91c1c; font-weight: 600; }

  /* tables */
  .table-wrap { border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
    box-shadow: 0 1px 3px rgba(0,0,0,.04); overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table.grid { width: 100%; min-width: 44rem; border-collapse: collapse; font-size: 12.5px; }
  /* A three-column parameter table does not need the ranked table's swipe width, and
     taking it would put a scrollbar under a table that already fits. */
  table.grid--tight { min-width: 0; }
  table.grid th { background: var(--line-soft); color: #334155; text-align: left; padding: 11px 14px;
    font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase;
    border-bottom: 1px solid var(--line); white-space: nowrap; }
  table.grid td { padding: 11px 14px; border-top: 1px solid var(--line); vertical-align: middle; }
  table.grid tbody tr:hover td { background: #fafcfe; }
  table.grid .empty-row { color: var(--muted); font-style: italic; }
  .rank-chip { display: inline-grid; place-items: center; min-width: 22px; height: 20px; padding: 0 5px;
    border-radius: 5px; background: var(--cat); color: #fff; font-family: var(--font-mono);
    font-size: 11px; font-weight: 700; }
  .class-chip { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; }
  .class-chip i { width: 11px; height: 11px; border-radius: 3px; border: 1px solid rgba(15,23,42,.25); flex: 0 0 auto; }
  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }

  /* maps */
  .maps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,440px),1fr));
    gap: 20px; margin-bottom: 8px; }
  .map-box { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .map-box h4 { margin: 0 0 4px; font-size: 13.5px; font-weight: 700; }
  .map-box p.cap { margin: 0 0 10px; font-size: 11.5px; color: var(--muted); }
  .map-box img { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; }
  .map-missing { color: #b91c1c; font-size: 12px; }

  /* raster panel */
  .raster { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px;
    box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .raster__head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
  .raster__file { font-size: 12px; color: var(--muted); }
  .share { display: flex; height: 16px; border-radius: 5px; overflow: hidden; border: 1px solid var(--line);
    margin: 16px 0 10px; }
  .share span { display: block; }
  .shares { list-style: none; margin: 0; padding: 0; display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4px 18px; }
  .shares li { display: grid; grid-template-columns: 13px 1fr auto; gap: 9px; align-items: center;
    font-size: 12px; padding: 3px 0; }
  .shares i { width: 13px; height: 13px; border-radius: 3px; border: 1px solid rgba(15,23,42,.25); }
  .shares b { font-family: var(--font-mono); font-weight: 500; color: var(--quiet); font-size: 11.5px; }
  .btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 7px;
    border: 1px solid var(--cat); background: var(--cat); color: #fff; font-size: 12.5px; font-weight: 600;
    text-decoration: none; }
  .btn--ghost { background: var(--surface); color: var(--cat); }

  /* weights */
  .weights { list-style: none; margin: 0; padding: 0; }
  .weights li { display: grid; grid-template-columns: 1fr 92px 46px; gap: 12px; align-items: center;
    font-size: 12.5px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .weights li:last-child { border-bottom: none; }
  .bar { height: 8px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 999px; background: var(--cat); }
  .weights .val { font-family: var(--font-mono); font-size: 11.5px; color: var(--quiet); text-align: right; }

  .banner { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 13px 17px;
    font-size: 12.5px; color: #92400e; margin-bottom: 22px; }
  .attribution { font-size: 11.5px; color: var(--muted); border-top: 1px solid var(--line);
    padding-top: 15px; margin-top: 28px; line-height: 1.55; }
  .disclaimer { background: #fff8f8; border: 1px solid #fed7d7; border-radius: 6px; padding: 16px 20px;
    font-size: 12px; color: #742a2a; margin: 26px 0; }
  .footer { text-align: center; padding: 26px; font-size: 12px; color: var(--muted);
    border-top: 1px solid var(--line); background: var(--surface); margin-top: 30px; }

  @media (max-width: 760px) {
    .header { padding: 22px 20px; }
    .header-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
    .header h1 { font-size: 19px; }
    .header-client { max-width: 100%; overflow-wrap: anywhere; }
    .meta-bar { padding: 12px 20px; justify-content: flex-start; }
    .container { margin: 20px auto; padding: 0 14px; }
    .verdict { grid-template-columns: 1fr; }
    .verdict__big { font-size: 44px; }
    .fact { grid-template-columns: 1fr; gap: 2px; }
    .footer { padding: 20px 14px; }
  }
  @media print {
    @page { margin: 14mm; }
    body { background: #fff; }
    .header, .meta-bar, .verdict__score, .verdict__limit, .map-box, .raster, .table-wrap,
    .badge, .rank-chip, .bar span, .shares i, .btn {
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .map-box, .raster, .verdict__score, .verdict__limit, .disclaimer, .attribution, .note, .table-wrap
      { break-inside: avoid; box-shadow: none; }
    .section-title { break-after: avoid; }
    .container { max-width: none; margin: 14px 0; padding: 0; }
    .table-wrap { overflow: visible; }
    table.grid { min-width: 0; }
    .maps-grid { grid-template-columns: 1fr 1fr; }
    .btn { display: none; }
  }
"""

def _pct(pct: float) -> str:
    """One decimal, except that a class holding cells never reads as zero.

    A 0.01% share is a real, mappable handful of pixels; "0.0%" tells the reader the class
    is absent when the map right beside it shows it.
    """
    if pct <= 0:
        return "0%"
    if pct < 0.05:
        return "&lt;0.1%"
    return f"{pct:.1f}%"


def _inputs_line(used: dict) -> str:
    """The selectable labels joined, plus the scene dates when a composite had any.

    A seasonal composite is a choice of passes, not just of product: two reports can print the
    same input line and still be built from different acquisitions, and the dates are the only
    record that tells them apart.
    """
    selectable = used.get("selectable", {})
    parts = [v["label"] for v in selectable.values()]
    scenes = (selectable.get("optical") or {}).get("scenes") or []
    line = " · ".join(parts)
    if scenes:
        line += " · scenes " + ", ".join(scenes)
    return line


def _sources_note(used: dict) -> str:
    """What the rasters on disk for this survey area actually came from.

    Read off the fetch sidecars rather than from the request or the module defaults, so a
    report about a cached refetch cannot credit the coverage the caller asked for when the
    numbers came from the one already on disk.
    """
    parts = []
    chosen = _inputs_line(used)
    fixed = list(used.get("fixed", {}).values())
    if chosen:
        parts.append("<strong>Chosen for this run:</strong> " + _e(chosen))
    if fixed:
        parts.append("<strong>Fixed inputs:</strong> " + _e(" · ".join(fixed)))
    if not parts:
        return ""
    return ('<div class="note"><strong>Inputs this score was computed from.</strong> '
            + "<br>".join(parts) + "</div>")


def _attribution_block(used: dict) -> str:
    """Provider credit, with the swappable layers named as this run recorded them.

    The optical layer stays out of the list: the sentence already credits the agency behind
    those pixels, and appending its composite label would read as a second dataset.
    """
    selectable = used.get("selectable", {})
    credit = selectable["optical"]["credit"]
    named = ", ".join(v["label"] + " (CC BY 4.0)"
                      for key, v in selectable.items() if key != "optical")
    lead = f"{credit} and {named}" if named else credit
    return (
        '<div class="attribution"><strong>Data attribution:</strong> '
        f"{lead} via Digital Earth Africa; JAXA ALOS PALSAR mosaic (&copy; JAXA/METI); "
        "the Landsat-derived water and fractional-cover layers courtesy of USGS/NASA; "
        "CHIRPS precipitation courtesy of the Climate Hazards Center, UC Santa Barbara.</div>"
    )


def _raster_section(cat: Category) -> str:
    """The classified GeoTIFF itself: its shares, and the two ways to open it.

    Stated from the raster on disk rather than from the summary, because the summary can
    describe a run whose output was later replaced.
    """
    dec = decode_raster(cat)
    if dec is None:
        return (
            '<div class="section-title">Classified raster</div>'
            f'<p class="note">This survey did not write <span class="mono">{_e(cat.zones_tif)}</span>, '
            "so there is no raster to inspect. The cartography above is unchanged.</p>"
        )
    legend = dec["legend"]
    segments = "".join(
        f'<span style="width:{row["pct"]:.2f}%;background:{row["color"]}" title="{_e(row["label"])}"></span>'
        for row in legend if row["count"]
    )
    shares = "".join(
        f'<li><i style="background:{row["color"]}"></i><span>{_e(row["label"])}</span>'
        f'<b>{_pct(row["pct"])}</b></li>'
        for row in legend
    )
    area_km2 = round(dec["width"] * dec["height"] * dec["cell_x"] * dec["cell_y"] / 1e6, 1)
    epsg = dec["epsg"] or "unknown"
    return f"""
    <div class="section-title">Classified raster behind the map</div>
    <div class="raster">
      <div class="raster__head">
        <div class="raster__file">
          <strong class="mono">{_e(cat.zones_tif)}</strong> &bull;
          {dec["width"]} &times; {dec["height"]} cells &bull; {dec["cell_x"]:.0f} m &bull;
          {area_km2} km&sup2; &bull; EPSG:{_e(str(epsg))}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="{_e(cat.slug)}_raster_viewer.html">Open the raster viewer</a>
          <a class="btn btn--ghost" href="{_e(cat.zones_tif)}" download>Download GeoTIFF</a>
        </div>
      </div>
      <div class="share" role="img" aria-label="Share of the survey area held by each zone class.">{segments}</div>
      <ul class="shares">{shares}</ul>
      <p class="note" style="margin:14px 0 0">The map above is this raster drawn with hillshade,
      labels and ranked sites. The viewer is the raster at full resolution: pan and zoom to cell
      level, and read each cell's class and index value off the image itself.</p>
    </div>"""


def _depth_section(cat: Category, data: dict) -> str:
    """Show the depth column's arithmetic, because a depth that reads like a measurement
    has to say how it was estimated before a crew is sent out on the strength of it."""
    model = data.get("screening_depth_model")
    if not isinstance(model, dict) or not model:
        return ""

    rows = []
    bands = model.get("bands")
    penetration = _number(model.get("test_hole_penetration_m"))
    if isinstance(bands, list) and bands:
        headers = ("Landform", "Slope", "Expected cover", "First test hole")
        prev_cap = None
        for band in bands:
            if not isinstance(band, dict):
                continue
            cover = band.get("cover_m") or []
            low = _number(cover[0]) if len(cover) > 0 else None
            high = _number(cover[1]) if len(cover) > 1 else None
            cap = _number(band.get("max_slope_deg"))
            hole = high + penetration if high is not None and penetration is not None else None
            # The last band is the catch-all, so its slope reads as whatever the previous
            # band stopped short of, not as an unbounded "any".
            if cap is None:
                slope_cell = f"> {_fmt_score(prev_cap)}°" if prev_cap is not None else "any slope"
            else:
                slope_cell = f"≤ {_fmt_score(cap)}°"
            rows.append((
                _e(str(band.get("landform") or "N/A")),
                slope_cell,
                f"{_fmt_score(low)}–{_fmt_score(high)} m",
                f"{_fmt_score(hole)} m",
            ))
            if cap is not None:
                prev_cap = cap
    else:
        headers = ("Season", "At the valley floor", "Per metre of rise above it")
        for label, key in (("Wet season", "wet_season"), ("Dry season", "dry_season")):
            part = model.get(key)
            if not isinstance(part, dict):
                continue
            floor = _number(part.get("floor_m"))
            ratio = _number(part.get("ratio"))
            if floor is None or ratio is None:
                continue
            rows.append((
                _e(label),
                f"{_fmt_score(floor)} m",
                f"{_fmt_score(ratio)} m",
            ))

    if not rows:
        return ""

    is_cover = isinstance(bands, list) and bands
    ceiling = _number(model.get("ceiling_m"))
    limits = []
    if ceiling is not None:
        limits.append(f"estimates stop at {_fmt_score(ceiling)} m below surface")
    dissected = _number(model.get("dissected_relief_m"))
    if dissected is not None:
        limits.append(f"ground broken by more than {_fmt_score(dissected)} m of local relief "
                      "counts as stripped, and its band moves one step thinner")
    cells = _number(model.get("channel_catchment_cells"))
    if cells is not None:
        # A cell count means nothing in the field; the ground it drains does.
        km2 = cells * (cfg.CELL / 1000.0) ** 2
        limits.append(f"a channel starts where about {_fmt_score(km2)} km&sup2; of rising ground drains in")

    parts = []
    if limits:
        listed = "; ".join(limits)
        # Only the groundwater model stops at a hard ceiling. The cover model just shifts
        # a landform band, so calling that "capped" would claim a limit it does not have.
        parts.append(f"The model is capped: {listed}." if ceiling is not None
                     else f"{listed[0].upper()}{listed[1:]}.")
    if is_cover:
        parts.append("The cover is a landform band rather than a site measurement, so two targets "
                     "on the same landform carry the same range.")
    else:
        parts.append("Open water and seasonally saturated ground are read from the land cover "
                     "rather than from the relief.")
    limit_line = " ".join(parts)

    head = "".join(f"<th>{_e(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f'<td class="mono">{c}</td>' for c in row) + "</tr>"
                   for row in rows)
    confirm = _e(str(model.get("confirm_with") or ""))
    return f"""
    <div class="section-title">How deep to expect it</div>
    <div class="note"><strong>Estimated, not measured.</strong>
    {_e(str(model.get("basis") or "Method not recorded."))} {limit_line}</div>
    <div class="table-wrap"><table class="grid grid--tight"><thead><tr>{head}</tr></thead>
    <tbody>{body}</tbody></table></div>
    <div class="note"><strong>Confirm before mobilising.</strong> {confirm}</div>"""


def build_report_html(cat: Category, data: dict) -> str:
    """One category, one self-contained client document."""
    head = headline_of(cat, data)
    ranked = candidates_of(cat, data)
    identity = _survey_identity([data]) or {
        "latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON,
        "client": cfg.CLIENT, "address": cfg.CLIENT_ADDRESS,
    }
    client = _e(str(identity["client"] or cfg.DEFAULT_CLIENT))
    address = _e(str(identity["address"] or ""))
    lat, lon = identity["latitude"], identity["longitude"]
    zone = int((lon + 180.0) // 6.0) + 1
    epsg = (32700 + zone) if lat < 0 else (32600 + zone)
    generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    accent = cat.accent

    # --- verdict
    top = ranked[0] if ranked else None

    # Hazard scores the target twice: for hazard (lower is safer) and for safety
    # (higher is safer). The headline carries safety, because that is the decision the
    # client is making, and hazard stays as a fact so neither number is hidden.
    headline_score = head["safety_score"] if cat.hazard_raster else head["score"]
    headline_label = head["klass"]
    score_color = band(headline_score)
    hazard_note = (
        f'<div class="fact"><dt>Hazard index at target</dt><dd class="mono" '
        f'style="color:{band(head["score"], lower_is_better=True)}">'
        f'{_fmt_out_of(head["score"])}</dd></div>'
    ) if cat.hazard_raster else ""
    assess = _assessment_of(data)
    detail_keys = {key for col in cat.detail_columns for key in col.keys}
    # The depth story has its own columns and its own arithmetic panel; leaving these keys
    # in the indicator strip would show "Overburden min m" beside its own range.
    indicators = "".join(
        f'<div class="fact"><dt>{_e(_weight_name(k))}</dt><dd class="mono">{_fmt_score(v)}</dd></div>'
        for k, v in [(k, v) for k, v in head["indicators"].items()
                     if k not in detail_keys and _number(v) is not None][:4]
    )
    depth_facts = "".join(
        f'<div class="fact"><dt>{_e(label)} at the target</dt><dd class="mono">{text}</dd></div>'
        for label, text in _detail_cells(cat, assess)
    )
    breakdown = "".join(
        f'<div class="fact"><dt>{_e(_weight_name(k))}</dt><dd class="mono">{_fmt_out_of(v)}</dd></div>'
        for k, v in head["breakdown"].items()
    )
    parcel_line = (
        f'<div class="fact"><dt>{_e(cat.parcel_label)}</dt><dd class="mono">'
        f'{_fmt_out_of(head["parcel_score"])}'
        + (f' ({_short_class(head["parcel_class"])})' if head["parcel_class"] else "")
        + "</dd></div>"
    )

    verdict = f"""
    <div class="verdict">
      <div class="verdict__score">
        <div class="verdict__label">{_e(cat.metric_label)} at the target cell</div>
        <div class="verdict__big" style="color:{score_color};">{_fmt_score(headline_score)}</div>
        <span class="badge" style="background:{score_color};">{_fmt_label(headline_label)}</span>
        <div class="verdict__facts">
          {parcel_line}
          {hazard_note}
          <div class="fact"><dt>{_e(cat.candidate_noun)} sites ranked</dt><dd class="mono">{len(ranked)}</dd></div>
          <div class="fact"><dt>Nearest ranked site</dt><dd class="mono">{_fmt_distance(top.get("distance_from_target_km") if top else None)}</dd></div>
          {depth_facts}
          <div class="fact"><dt>Field verification</dt><dd>{_e(cat.verification)}</dd></div>
          {indicators}
          {breakdown}
        </div>
      </div>
      <div class="verdict__limit">
        <h3>What this report supports</h3>
        <p><span class="limit-yes">Yes:</span> prioritising where to spend field effort inside this
        survey area, in rank order, with coordinates you can navigate to.</p>
        <p><span class="limit-no">No:</span> {_e(cat.claim_limit)}</p>
        <h3>How the number is built</h3>
        <p>Every score is a percentile within <em>this</em> AOI. Class edges come from Jenks natural
        breaks on the index produced for this property, so a 62 here is not a 62 on another site, and
        two reports for the same land only compare if they share one survey area.</p>
      </div>
    </div>"""

    # --- ranked table (every candidate, not the top three)
    detail_headers = "".join(f"<th>{_e(col.label)}</th>" for col in cat.detail_columns)
    base_headers = ("<th>Rank</th><th>Zone class</th><th>Latitude</th><th>Longitude</th>"
                    f"<th>From target</th>{detail_headers}<th>Score</th>")
    if ranked:
        rows = []
        for item in ranked:
            code = item.get("class_code")
            color = cat.zone_colors.get(code, NODATA_HEX)
            name = item.get("class_name") or cat.cand_labels.get(code, "Unclassified")
            if cat.hazard_raster:
                name = cat.cand_labels.get(code, name)
            details = "".join(f'<td class="mono">{_detail_cell(col, item)}</td>'
                              for col in cat.detail_columns)
            rows.append(
                "<tr>"
                f'<td><span class="rank-chip">{_fmt_score(item.get("rank"))}</span></td>'
                f'<td><span class="class-chip"><i style="background:{color}"></i>{_fmt_label(name)}</span></td>'
                f'<td class="mono">{_fmt_coord(item.get("latitude"))}</td>'
                f'<td class="mono">{_fmt_coord(item.get("longitude"))}</td>'
                f'<td class="mono">{_fmt_distance(item.get("distance_from_target_km"))}</td>'
                + details +
                f'<td><strong class="mono" style="color:{band(item.get("potential_score"))};">'
                f'{_fmt_out_of(item.get("potential_score"))}</strong></td>'
                "</tr>"
            )
        table = (
            '<div class="table-wrap"><table class="grid"><thead><tr>'
            + base_headers + "</tr></thead><tbody>"
            + "".join(rows) + "</tbody></table></div>"
        )
    else:
        span = 6 + len(cat.detail_columns)
        table = (
            '<div class="table-wrap"><table class="grid"><thead><tr>'
            + base_headers + f'</tr></thead><tbody><tr><td colspan="{span}" class="empty-row">'
            "No location cleared the screening threshold for this "
            "category in this survey area. The zoning map still shows the gradient that was found.</td>"
            "</tr></tbody></table></div>"
        )

    # --- maps
    panels = []
    for filename, title, alt in cat.maps:
        src, why = _img_to_base64_src(cfg.OUT / filename)
        inner = (f'<img src="{src}" alt="{alt}"/>' if src
                 else f'<p class="map-missing">Not embedded: {why}.</p>')
        panels.append(f'<div class="map-box"><h4>{_e(title)}</h4>'
                      f'<p class="cap">{_e(filename)}</p>{inner}</div>')
    maps_html = "".join(panels)

    # --- raster panel
    raster_html = _raster_section(cat)

    # --- depth panel, only when the survey recorded how the depths were built
    depth_html = _depth_section(cat, data)

    # --- model composition
    weights = data.get("model_weights") or data.get("weights_used") or {}
    weight_items = ""
    if isinstance(weights, dict) and weights:
        ordered = sorted(weights.items(), key=lambda kv: -(_number(kv[1]) or 0))
        total = sum((_number(v) or 0) for _, v in ordered) or 1.0
        weight_items = "".join(
            f'<li><span>{_e(_weight_name(k))}</span>'
            f'<span class="bar"><span style="width:{((_number(v) or 0) / total * 100):.0f}%"></span></span>'
            f'<span class="val">{(_number(v) or 0) * 100:.0f}%</span></li>'
            for k, v in ordered
        )
        weight_items = f'<ul class="weights">{weight_items}</ul>'
    else:
        weight_items = '<p class="note">This summary did not record its model weights.</p>'

    breaks = data.get("natural_breaks") or data.get("jenks_breaks") or []
    breaks_html = ""
    if isinstance(breaks, list) and breaks:
        edges = [_fmt_score(b) for b in breaks]
        breaks_html = (
            '<div class="note"><strong>Class edges on this survey\'s index:</strong> '
            '<span class="mono">&lt; ' + " · ".join(edges) + " · &gt;</span> — "
            "below the first edge is the lowest class, above the last is the highest.</div>"
        )

    banner = ""
    if not ranked:
        banner = ('<div class="banner"><strong>No ranked sites.</strong> The index was computed, '
                  "but nothing in this survey area cleared the siting threshold for this category.</div>")

    used = fetch_data.used_sources()
    attribution = _attribution_block(used)
    sources_html = _sources_note(used)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="SiteSurveyor AI {_e(cat.name)} report for {client}.">
<title>{client} — {_e(cat.name)} report — SiteSurveyor AI</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {{ --cat: {accent}; }}
{REPORT_CSS}
</style>
</head>
<body>
  <div class="header">
    <div class="header-inner">
      <div class="header-brand">
        <div class="brand-mark"><img src="{_logo_data_uri()}" alt="SiteSurveyor logo"></div>
        <div>
          <div class="subtitle">An Eineva Labs product &bull; Autonomous Earth Observation Intelligence</div>
          <h1>{_e(cat.name)} <span class="header-badge">Category report</span></h1>
        </div>
      </div>
      <div class="header-client">
        <div>Client: <strong>{client}</strong></div>
        {'<div>Property: <strong>' + address + '</strong></div>' if address else ''}
      </div>
    </div>
  </div>

  <div class="meta-bar">
    <div class="meta-item"><strong>Latitude:</strong> <span>{lat:.5f}&deg;</span></div>
    <div class="meta-item"><strong>Longitude:</strong> <span>{lon:.5f}&deg;</span></div>
    <div class="meta-item"><strong>Datum / CRS:</strong> <span>WGS 84 / UTM {zone}{'S' if lat < 0 else 'N'} (EPSG:{epsg})</span></div>
    <div class="meta-item"><strong>Resolution:</strong> <span>30 m grid</span></div>
    <div class="meta-item"><strong>Generated:</strong> <span>{generated}</span></div>
  </div>

  <div class="container">
    {banner}
    {verdict}

    <div class="section-title">Prioritised field verification coordinates</div>
    <div class="note"><strong>Work the list top-down.</strong> Rank is computed inside this survey area
    and weighted by distance from the property, so the second and third entries are the fallbacks when
    the highest-scoring cell is already occupied. On a phone, swipe the table sideways for the rest.</div>
    {table}
    {depth_html}

    <div class="section-title">Survey cartography</div>
    <div class="maps-grid">{maps_html}</div>

    {raster_html}

    <div class="section-title">How this category is modelled</div>
    {sources_html}
    {breaks_html}
    {weight_items}

    {attribution}
    <div class="disclaimer"><strong>SCREENING-LEVEL INTELLIGENCE DISCLAIMER.</strong> Produced by
    SiteSurveyor AI from multi-sensor satellite Earth Observation. This report is pre-feasibility
    probability zoning, not a certified geotechnical, hydrogeological or mining engineering
    investigation. Ground confirmation — {_sentence(cat.verification)} — is required before drilling,
    excavation, construction or capital commitment.</div>
  </div>

  <div class="footer">
    SiteSurveyor AI &bull; {_e(cat.name)} report for <strong>{client}</strong> &bull;
    Produced by <strong>{_e(cfg.ANALYST)}</strong> &bull; All Rights Reserved.
  </div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# The raster viewer
# ---------------------------------------------------------------------------
def build_viewer_html(cat: Category, dec: dict, files: dict, data: dict | None) -> str:
    """Fill the viewer template for one decoded raster.

    The image references are relative so the page works both from the /outputs mount and
    from inside the category ZIP; the API endpoints redirect here rather than serving the
    HTML from their own path, which would break those same references.
    """
    identity = _survey_identity([data]) if data else None
    if identity is None:
        identity = {"latitude": cfg.TARGET_LAT, "longitude": cfg.TARGET_LON,
                    "client": cfg.DEFAULT_CLIENT, "address": ""}
    ranked = candidates_of(cat, data) if data else []

    xmin, ymin, xmax, ymax = dec["bounds_utm"]
    sites = []
    for item in ranked:
        col_row = _pixel_of(dec["to_local"], item.get("longitude", 0), item.get("latitude", 0),
                            dec["cell_x"], dec["cell_y"], xmin, ymax)
        if col_row is None:
            continue
        code = item.get("class_code")
        sites.append({
            "col": col_row[0], "row": col_row[1],
            "rank": _number(item.get("rank")) or len(sites) + 1,
            "lat": _number(item.get("latitude")) or 0.0,
            "lon": _number(item.get("longitude")) or 0.0,
            "score": _number(item.get("potential_score")) or 0.0,
            "dist_km": _number(item.get("distance_from_target_km")) or 0.0,
            "label": cat.cand_labels.get(code, item.get("class_name") or "Unclassified"),
            "color": cat.zone_colors.get(code, NODATA_HEX),
            "facts": [[label, text] for label, text in _detail_cells(cat, item)],
        })

    target = None
    if dec["epsg"]:
        col_row = _pixel_of(dec["to_local"], identity["longitude"], identity["latitude"],
                           dec["cell_x"], dec["cell_y"], xmin, ymax)
        if col_row:
            target = {"col": col_row[0], "row": col_row[1],
                      "lat": identity["latitude"], "lon": identity["longitude"]}

    breaks = (data or {}).get("natural_breaks") or (data or {}).get("jenks_breaks") or []
    nodata = next((r for r in dec["legend"] if r["code"] == NODATA_CLASS), None)
    payload = {
        "width": dec["width"], "height": dec["height"], "cell_m": dec["cell_x"],
        "xmin": xmin, "ymax": ymax, "epsg": dec["epsg"],
        "cols": dec["cols"], "rows": dec["rows"], "grid": dec["grid"],
        "legend": dec["legend"], "breaks": [float(b) for b in breaks if _number(b) is not None],
        # A no-data cell carries index 0 on disk, which is a real and very low score for
        # every other class. The inspector has to know the difference.
        "nodata": NODATA_CLASS,
        "sites": sites, "target": target,
        "class_key": files["class_key"].name,
        "score_key": files["score_key"].name if files.get("score_key") else None,
        "no_image_message": (
            "The raster image is not next to this page. Open it from /outputs on the engine, or "
            "extract the whole category folder from its ZIP — the viewer needs "
            f"{cat.slug}_raster_detail.png beside it."
        ),
    }

    def rel(path: Path | None) -> str:
        return f"./{path.name}" if path else "#"

    html = VIEWER_TEMPLATE
    chosen = _inputs_line(fetch_data.used_sources())
    filled = {
        "{{NAME}}": _e(cat.name),
        "{{CLIENT}}": _e(str(identity["client"] or cfg.DEFAULT_CLIENT)),
        "{{TARGET}}": f'{identity["latitude"]:.5f}, {identity["longitude"]:.5f}',
        "{{DIMENSIONS}}": f"{dec['width']} × {dec['height']}",
        "{{GENERATED}}": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "{{LOGO}}": _logo_data_uri(),
        "{{ACCENT}}": cat.accent,
        "{{ACCENT_DARK}}": cat.accent_dark,
        "{{W}}": str(dec["width"]),
        "{{H}}": str(dec["height"]),
        "{{CELL}}": f"{dec['cell_x']:.0f} m",
        "{{CRS_LABEL}}": f"EPSG:{dec['epsg']}" if dec["epsg"] else "local grid",
        "{{EXTENT}}": f"{xmin:.0f}–{xmax:.0f} E · {ymin:.0f}–{ymax:.0f} N",
        "{{NODATA_SHARE}}": f"{nodata['pct']:.1f}% of cells" if nodata else "none",
        "{{SOURCES}}": _e(chosen) or "engine defaults",
        "{{INDEX_LABEL}}": _e(cat.index_label),
        "{{CAND_NOUN}}": _e(cat.candidate_noun),
        "{{TIFF_HREF}}": f"./{cat.zones_tif}",
        "{{TIFF_NAME}}": _e(cat.zones_tif),
        "{{DETAIL}}": rel(files["detail"]),
        "{{REPORT_HREF}}": f"./{report_path(cat).name}",
        "{{ANALYST}}": _e(cfg.ANALYST),
        "__DATA_JSON__": json.dumps(payload, separators=(",", ":"), ensure_ascii=True),
        "{{NO_IMAGE}}": _e(payload["no_image_message"]),
    }
    for token, value in filled.items():
        html = html.replace(token, value)
    return html


# ---------------------------------------------------------------------------
# Public: build a category's artefacts when the files on disk are missing or stale
# ---------------------------------------------------------------------------
def generate_report(key: str) -> dict:
    """Write ``<slug>_report.html`` from the category summary already on disk."""
    cat = get(key)
    if cat is None:
        raise LookupError(f"Unknown category '{key}'.")
    data, status = _load_category(cfg.OUT / cat.summary_file)
    if data is None:
        raise LookupError(status)
    report_path(cat).write_text(build_report_html(cat, data), encoding="utf-8")
    return {"status": status}


def generate_viewer(key: str) -> dict:
    """Write the classified-raster viewer plus the lookup keys it reads per pixel."""
    cat = get(key)
    if cat is None:
        raise LookupError(f"Unknown category '{key}'.")
    dec = decode_raster(cat)
    if dec is None:
        raise LookupError("raster_unavailable")
    data, _status = _load_category(cfg.OUT / cat.summary_file)
    files = write_raster_artefacts(cat, dec)
    viewer_path(cat).write_text(build_viewer_html(cat, dec, files, data), encoding="utf-8")
    return {"status": _status}


def ensure(kind: str, key: str) -> dict:
    """Build on demand, and rebuild whenever the summary is newer than the artefact.

    Serving last month's report for this month's survey is the failure a client cannot
    see coming, so the summary's own timestamp decides whether the file is reused.
    """
    cat = get(key)
    if cat is None:
        return {"ok": False, "code": "unknown_category",
                "message": f"'{key}' is not a survey category. Use water, minerals, soil or hazard."}
    source = cfg.OUT / cat.summary_file
    data, status = _load_category(source)
    if data is None:
        return {"ok": False, "code": "not_run",
                "message": f"No {cat.short} output exists on this instance.", "status": status}
    if kind == "viewer" and not (cfg.OUT / cat.zones_tif).exists():
        return {"ok": False, "code": "no_raster",
                "message": f"This survey did not write the {cat.short} classified raster."}
    path = report_path(cat) if kind == "report" else viewer_path(cat)
    if path.exists() and not _newer(source, path):
        return {"ok": True, "path": path}
    try:
        (generate_report if kind == "report" else generate_viewer)(key)
    except Exception as exc:
        if path.exists():
            return {"ok": True, "path": path, "stale": True, "reason": str(exc)}
        return {"ok": False, "code": "build_failed", "message": str(exc)}
    return {"ok": True, "path": path}


def bundle_members(key: str) -> tuple[Category, list[Path]]:
    """The files that make up one category's export, whatever this instance has."""
    cat = get(key)
    if cat is None:
        raise KeyError(key)
    names = [cat.summary_file, report_path(cat).name, viewer_path(cat).name,
             cat.zones_tif, cat.index_tif]
    names += [f for f, _, _ in cat.maps]
    names += [f"{cat.slug}_raster_detail.png", f"{cat.slug}_class_key.png", f"{cat.slug}_score_key.png"]
    names += [f"{cat.vector_base}.{ext}" for ext in ("csv", "geojson", "kml", "kmz")]
    return cat, [cfg.OUT / n for n in dict.fromkeys(names) if (cfg.OUT / n).exists()]

