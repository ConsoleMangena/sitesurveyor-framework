"""
SiteSurveyor AI — Central Configuration & Dynamic AOI Context
=============================================================
All site parameters, dynamic AOI definitions, automatic UTM zone CRS projection,
grid extents, and AHP model weights are managed here.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

# Configure PROJ data paths before importing rasterio/pyproj
import pyproj.datadir
proj_dir = pyproj.datadir.get_data_dir()
os.environ["PROJ_DATA"] = proj_dir
os.environ["PROJ_LIB"] = proj_dir

import numpy as np
from dotenv import load_dotenv
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.transform import from_origin

load_dotenv()

# --- Paths ---
ROOT = Path(__file__).resolve().parents[1]

# Render's container filesystem is ephemeral: anything written under /app is discarded on
# every deploy and restart, which took the deliverable maps, the KMZ files and the
# executive report with it. SITESURVEYOR_STATE_DIR points the survey cache and the
# published outputs at a mounted disk instead. Unset, it is the repository root, so local
# runs and the test suite keep working exactly as before.
_state_override = os.getenv("SITESURVEYOR_STATE_DIR", "").strip()
STATE_DIR = Path(_state_override).expanduser() if _state_override else ROOT
DATA_DIR = STATE_DIR / "data"
RAW_BASE = DATA_DIR / "raw"
EXTERNAL = DATA_DIR / "external"
OUT = STATE_DIR / "outputs"
for d in (RAW_BASE, EXTERNAL, OUT):
    d.mkdir(parents=True, exist_ok=True)

# --- API ---
WCS_URL = "https://ows.digitalearth.africa/wcs"
# The catalogue is what tells us which Sentinel-2 scenes exist in a season and how cloudy
# each one is; WCS then delivers the pixels. Without it a composite would be built by
# guessing dates and counting 404s.
STAC_URL = "https://explorer.digitalearth.africa/stac/search"
API_KEY = (
    os.getenv("DEAFRICA_SANDBOX_API_KEY")
    or os.getenv("DE_AFRICA_TOKEN")
    or os.getenv("DE_AFRICA_API_KEY")
    or ""
)

HEADERS = {
    "User-Agent": "SiteSurveyorAI/2.0",
}
if API_KEY:
    HEADERS["Authorization"] = f"Bearer {API_KEY}"
    HEADERS["x-api-key"] = API_KEY

# --- Branding & Grid Base Constants ---
ANALYST = "Eineva Labs"
BRAND_COLOR = "#D14141"
CELL = 30.0  # metres

# Limit GDAL block cache to prevent greedy RAM consumption on constrained containers (512MB RAM)
os.environ.setdefault("GDAL_CACHEMAX", "32")
# Instruct glibc to promptly return freed heap pages back to the Linux OS kernel
os.environ.setdefault("MALLOC_TRIM_THRESHOLD_", "65536")

# Map render buffers scale with the square of this: a survey peaks at >500 MB of
# process memory with maps at 120 dpi, tripping the 512 MB Linux cgroup limit on Starter tier.
# At 90 dpi on-screen clarity is pristine while memory footprint drops by >44%.
MAP_DPI = int(os.getenv("MAP_DPI", "90"))

# --- Water Model Weights (AHP) ---
WATER_WEIGHTS = {
    "lineament_density": 0.26,
    "slope": 0.18,
    "twi": 0.18,
    "landcover_infiltration": 0.12,
    "drainage_density": 0.10,
    "rainfall": 0.08,
    "ndvi": 0.08,
}

# --- Mineral Model Weights (AHP) ---
MINERAL_WEIGHTS = {
    "lineament_density": 0.28,
    "lineament_intersections": 0.18,
    "iron_oxide": 0.14,
    "hydroxyl_clay": 0.14,
    "ferrous_mafic": 0.12,
    "relative_relief": 0.08,
    "endowment": 0.06,
}

# --- Soil & Land Model Weights (AHP) ---
SOIL_WEIGHTS = {
    "erosion_risk":   0.25,
    "soil_moisture":  0.20,
    "vegetation":     0.18,
    "landcover":      0.15,
    "wetness":        0.12,
    "rainfall":       0.10,
}

# --- Hazard & Environmental Risk Weights (AHP) ---
HAZARD_WEIGHTS = {
    "flood_inundation": 0.30,
    "slope_failure":    0.20,
    "erosion_washout":  0.20,
    "wildfire_fuel":    0.15,
    "drought_stress":   0.15,
}

# --- Screening Depth Model ---
# Two questions a crew asks before it mobilises: how deep is the water, and how deep is
# the soil before solid rock. Neither is measured from orbit; both are read off the same
# 30 m DEM the indices use, so every report calls them estimates and names the method.
# These are the calibration knobs; the reasoning lives in src/utils/depth.py.
DEPTH_MODEL = {
    # A cell counts as valley floor once its D8 catchment reaches this many 30 m cells.
    # The threshold has to clear first-order rills: on this low-relief craton a single
    # 30 m cell in a narrow hollow is not a local base level, and if it counts as one,
    # every valley-floor candidate comes back at the same shallow depth and the column
    # says nothing. At ~2.25 km² of rising ground behind it, the valley is a valley.
    "channel_catchment_cells": 2500,
    # Water table: depth below surface = floor + ratio x height above the channel floor.
    # The dry-season ratio carries the drawdown between the November rains and the May low.
    "groundwater_wet_floor_m": 1.0,
    "groundwater_wet_ratio": 0.30,
    "groundwater_dry_floor_m": 3.0,
    "groundwater_dry_ratio": 0.70,
    "groundwater_max_m": 60.0,
    # Seasonally saturated land keeps its wet-season table at or near the surface.
    "wetland_wet_max_m": 0.5,
    "wetland_dry_max_m": 3.0,
    # Overburden bands: (upper slope limit in degrees, landform, cover metres low, high).
    "overburden_bands": [
        (3.0, "Valley floor and alluvial flat", 4.0, 12.0),
        (8.0, "Lower slope and colluvial apron", 2.0, 6.0),
        (15.0, "Mid-slope residual mantle", 1.0, 3.0),
        (float("inf"), "Crest, ridge and scarp", 0.0, 1.0),
    ],
    # Ground this broken has been stripped of mantle, so the band moves one step thinner.
    "dissected_relief_m": 10.0,
    # The first hole has to prove the contact, so it goes this far past the cover.
    "test_hole_penetration_m": 3.0,
    # Method ladders: (depth limit in metres, what that depth needs on site).
    "borehole_reads": [
        (5.0, "Hand-dug well or sand point"),
        (30.0, "Hand-pump borehole"),
        (float("inf"), "Rig-drilled cased borehole"),
    ],
    "sampling_reads": [
        (4.0, "Hand-excavated test pit"),
        (20.0, "Truck-mounted auger rig"),
        (float("inf"), "Wireline or diamond core rig"),
    ],
}

# ESA WorldCover class names, so a candidate row can say what stands on the ground
# rather than leaving the crew with a code.
LANDCOVER_NAMES = {
    10: "Trees",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare ground",
    70: "Snow and ice",
    80: "Water body",
    90: "Wetland",
    95: "Mangrove",
    100: "Moss and lichen",
}

# --- Selectable Input Sources ---
# Elevation and land cover qualify because their alternative coverages are interchangeable at
# the engine level: one band, same units, same class scheme. Optical qualifies on one condition
# only -- the fetch asks WCS for the five analysis bands BY NAME, so a product swap cannot
# renumber them. That condition is what lets Landsat in alongside Sentinel-2: both publish the
# five bands the engines read, at reflectance x10000 on the same 30 m analysis grid, and none of
# them reads a red-edge band, so Landsat's narrower layout scores the same part of the spectrum.
# What each optical product publishes at this survey area: the year stamps that return pixels,
# the windows that can be built from it, and the agency the pixels belong to. The spans were read
# off the live service rather than a product page, because a year a coverage does not answer for
# is a 404 in the middle of a survey. One source of truth: the registry options are derived from
# this table, so an entry here is an option and the two cannot drift.
OPTICAL_PRODUCTS: dict[str, dict] = {
    "gm_s2_annual": {
        "label": "Sentinel-2 Annual GeoMAD (median composite)",
        "years": (2019, 2025),
        "windows": ("annual",),
        "credit": "Copernicus Sentinel-2",
        "family": "Sentinel-2",
    },
    # Not a mosaic: the fetch pulls the clearest scenes inside the window from the catalogue and
    # medians them itself, which is what makes a season available at all.
    "s2_l2a": {
        "label": "Sentinel-2 L2A (clear-scene composite)",
        "years": (2019, 2026),
        "windows": ("annual", "dry", "wet"),
        "credit": "Copernicus Sentinel-2",
        "family": "Sentinel-2",
    },
    # Three generations of Landsat, and each answers for a different span of years: 2015 is a
    # valid stamp for Landsat 8 and a 404 for Landsat 5-7, so the year control has to follow the
    # coverage rather than offer the union of all of them.
    "gm_ls8_ls9_annual": {
        "label": "Landsat 8-9 Annual GeoMAD (median composite)",
        "years": (2021, 2025),
        "windows": ("annual",),
        "credit": "USGS/NASA Landsat",
        "family": "Landsat",
    },
    "gm_ls8_annual": {
        "label": "Landsat 8 Annual GeoMAD (median composite)",
        "years": (2013, 2020),
        "windows": ("annual",),
        "credit": "USGS/NASA Landsat",
        "family": "Landsat",
    },
    "gm_ls5_ls7_annual": {
        "label": "Landsat 5-7 Annual GeoMAD (median composite)",
        "years": (1984, 2012),
        "windows": ("annual",),
        "credit": "USGS/NASA Landsat",
        "family": "Landsat",
    },
}

DATA_SOURCES: dict[str, dict] = {
    "dem": {
        "label": "Elevation model",
        "layer": "dem",
        "default": "dem_cop_30",
        "options": {
            "dem_cop_30": "Copernicus DEM 30 m",
            "dem_srtm": "SRTM 30 m",
            "nasadem": "NASA DEM 30 m",
        },
    },
    "landcover": {
        "label": "Land cover map",
        "layer": "landcover",
        "default": "esa_worldcover_2021",
        "options": {
            "esa_worldcover_2021": "ESA WorldCover 2021",
            "esa_worldcover_2020": "ESA WorldCover 2020",
        },
    },
    # The menu is the product table, so the sandbox can never offer a coverage the composite
    # controls have no serving entry for. Sentinel-2 first because the model is calibrated on it.
    "optical": {
        "label": "Optical source",
        "layer": "optical",
        "default": "gm_s2_annual",
        "options": {cid: p["label"] for cid, p in OPTICAL_PRODUCTS.items()},
    },
}

# The window the optical layer aggregates over. Both settings belong to the chosen coverage, not
# to the engine: Landsat 5-7 stops where Sentinel-2 starts, and a GeoMAD mosaic publishes exactly
# one median per year with no seasonal slice, so the same control is a valid request for one
# source and a guaranteed 404 for another.
COMPOSITE_WINDOWS: dict[str, str] = {
    "annual": "Full year",
    "dry": "Dry season",
    "wet": "Wet season",
}
DEFAULT_COMPOSITE: dict[str, object] = {"year": 2023, "window": "annual"}

ACTIVE_COMPOSITE: dict[str, object] = dict(DEFAULT_COMPOSITE)

ACTIVE_SOURCES: dict[str, str] = {k: v["default"] for k, v in DATA_SOURCES.items()}

# The inputs a caller cannot choose: one coverage each, pinned in fetch_data.fetch_all.
# Listed so the API, the sandbox and every report can name what produced a score instead of
# leaving it implied -- a reader who knows the vegetation maths runs on the optical composite
# this run selected, over the window it selected, can judge the number; one who does not, cannot.
FIXED_SOURCES: dict[str, str] = {
    "alos": "ALOS PALSAR 2007 L-band mosaic",
    "wofs": "Water Observations from Space, Landsat all-time summary",
    "rainfall": "CHIRPS monthly rainfall, 24-month mean",
    "crop_mask": "Digital Earth Africa cropland extent",
    "fc_ls": "Digital Earth Africa Landsat fractional-cover annual summary",
}

# --- Dynamic AOI State Variables ---
TARGET_LON: float = 29.84597927542165
TARGET_LAT: float = -19.50487490194389
HALF_DEG: float = 0.12
UTM_ZONE: int = 35
EPSG: int = 32735
BBOX_WGS84: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
LOCAL_CRS: CRS = None
TO_LOCAL: Transformer = None
TO_WGS: Transformer = None
TO_6933: Transformer = None
XMIN: float = 0.0
XMAX: float = 0.0
YMIN: float = 0.0
YMAX: float = 0.0
WIDTH: int = 0
HEIGHT: int = 0
TRANSFORM = None
TARGET_X: float = 0.0
TARGET_Y: float = 0.0
TARGET_COL: int = 0
TARGET_ROW: int = 0
# Neutral defaults on purpose: a real person's name and street address used to be baked
# into these and published on the public dossier of every instance, including installs
# that never ran a survey of that property.
DEFAULT_CLIENT: str = "Site Survey"
DEFAULT_CLIENT_ADDRESS: str = "Property location not specified"
CLIENT: str = DEFAULT_CLIENT
CLIENT_ADDRESS: str = DEFAULT_CLIENT_ADDRESS
RAW: Path = RAW_BASE
AOI_SLUG: str = ""


def set_target_site(
    lat: float = -19.50487490194389,
    lon: float = 29.84597927542165,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
) -> None:
    """
    Dynamically configure active target coordinates, UTM zone projection, and 30m grid extents.

    Args:
        lat: Target latitude in decimal degrees.
        lon: Target longitude in decimal degrees.
        half_deg: Half-size of bounding box in degrees (default 0.12, ~13 km).
        client: Client or project name.
        address: Client property address or description.
    """
    global TARGET_LAT, TARGET_LON, HALF_DEG, BBOX_WGS84
    global UTM_ZONE, EPSG
    global LOCAL_CRS, TO_LOCAL, TO_WGS, TO_6933
    global XMIN, XMAX, YMIN, YMAX, WIDTH, HEIGHT, TRANSFORM
    global TARGET_X, TARGET_Y, TARGET_COL, TARGET_ROW
    global CLIENT, CLIENT_ADDRESS, RAW, AOI_SLUG

    TARGET_LAT = float(lat)
    TARGET_LON = float(lon)
    HALF_DEG = float(half_deg)

    if client:
        CLIENT = client
    if address:
        CLIENT_ADDRESS = address

    # Automatic UTM Zone calculation:
    # 6-degree longitudinal zones, 326xx for North, 327xx for South
    zone_number = int(np.floor((TARGET_LON + 180.0) / 6.0)) + 1
    epsg_code = (32700 + zone_number) if TARGET_LAT < 0 else (32600 + zone_number)
    UTM_ZONE = zone_number
    EPSG = epsg_code

    LOCAL_CRS = CRS.from_epsg(epsg_code)
    TO_LOCAL = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg_code}", always_xy=True)
    TO_WGS = Transformer.from_crs(f"EPSG:{epsg_code}", "EPSG:4326", always_xy=True)
    TO_6933 = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)

    BBOX_WGS84 = (
        TARGET_LON - HALF_DEG,
        TARGET_LAT - HALF_DEG,
        TARGET_LON + HALF_DEG,
        TARGET_LAT + HALF_DEG,
    )

    # Transform 4 bbox corners to metric coordinates
    _lon = [BBOX_WGS84[0], BBOX_WGS84[2], BBOX_WGS84[2], BBOX_WGS84[0]]
    _lat = [BBOX_WGS84[1], BBOX_WGS84[1], BBOX_WGS84[3], BBOX_WGS84[3]]
    _x, _y = TO_LOCAL.transform(_lon, _lat)

    XMIN = float(np.floor(min(_x) / CELL) * CELL)
    XMAX = float(np.ceil(max(_x) / CELL) * CELL)
    YMIN = float(np.floor(min(_y) / CELL) * CELL)
    YMAX = float(np.ceil(max(_y) / CELL) * CELL)

    WIDTH = int(round((XMAX - XMIN) / CELL))
    HEIGHT = int(round((YMAX - YMIN) / CELL))
    TRANSFORM = from_origin(XMIN, YMAX, CELL, CELL)

    TARGET_X, TARGET_Y = TO_LOCAL.transform(TARGET_LON, TARGET_LAT)
    TARGET_COL = int((TARGET_X - XMIN) / CELL)
    TARGET_ROW = int((YMAX - TARGET_Y) / CELL)

    # AOI-specific directory for satellite caching
    lat_h = 'S' if TARGET_LAT < 0 else 'N'
    lon_h = 'E' if TARGET_LON >= 0 else 'W'
    AOI_SLUG = f"{abs(TARGET_LAT):.2f}{lat_h}_{abs(TARGET_LON):.2f}{lon_h}"
    geometry = repr((BBOX_WGS84, CELL, EPSG)).encode("ascii")
    cache_key = hashlib.sha256(geometry).hexdigest()[:20]
    RAW = RAW_BASE / f"{AOI_SLUG}_{cache_key}"
    RAW.mkdir(parents=True, exist_ok=True)


def clear_target_site() -> None:
    """Return the live AOI and client identity to the neutral defaults.

    ``set_target_site`` only overwrites CLIENT when handed a truthy name, so a finished
    survey's client sticks to the module until something replaces it. Wiping the processed
    data has to replace it, or the next report would stamp this client's name on an
    instance that now holds no data about them at all.
    """
    set_target_site(client=DEFAULT_CLIENT, address=DEFAULT_CLIENT_ADDRESS)


def target_block(lat: float, lon: float, half_deg: float) -> dict:
    """Describe the AOI a survey ran over, from its parameters alone.

    Computed from the arguments rather than read back out of the module globals above,
    because another caller may have re-pointed those mid-run: a REST threadpool and a
    job worker both publish this block beside a finished score, and a block naming the
    wrong bbox would mislabel results a reader cannot check.
    """
    zone = int((lon + 180.0) // 6.0) + 1
    epsg = (32700 + zone) if lat < 0 else (32600 + zone)
    return {
        "latitude": lat,
        "longitude": lon,
        "half_deg": half_deg,
        "cell_m": CELL,
        "bbox_wgs84": [lon - half_deg, lat - half_deg, lon + half_deg, lat + half_deg],
        "utm_zone": f"{zone}{'S' if lat < 0 else 'N'}",
        "epsg": epsg,
        "crs": f"EPSG:{epsg}",
    }


def check_data_sources(sources: dict[str, str] | None) -> dict[str, str]:
    """Validate a selection against DATA_SOURCES and return the complete choice set.

    Rejects anything outside the registry rather than passing a bad coverageid through to
    WCS, where it would surface as a download failure several layers away from the choice
    that caused it. Layers the caller leaves out come back as their defaults rather than as
    whatever the previous survey selected: a request should describe the run it produces in
    full, or a report would state a source nobody asked for.
    """
    chosen = {key: spec["default"] for key, spec in DATA_SOURCES.items()}
    for key, value in (sources or {}).items():
        spec = DATA_SOURCES.get(key)
        if spec is None:
            raise ValueError(
                f"unknown data source '{key}'; selectable layers are "
                f"{', '.join(sorted(DATA_SOURCES))}"
            )
        if value not in spec["options"]:
            raise ValueError(
                f"'{value}' is not an available {spec['label'].lower()}; choose one of "
                f"{', '.join(spec['options'])}"
            )
        chosen[key] = value
    return chosen


def set_data_sources(sources: dict[str, str] | None) -> dict[str, str]:
    """Point the selectable input layers at the requested DEA coverages."""
    chosen = check_data_sources(sources)
    ACTIVE_SOURCES.update(chosen)
    return chosen


def clear_data_sources() -> None:
    """Restore every selectable layer to the coverage the model is calibrated on."""
    ACTIVE_SOURCES.update({k: v["default"] for k, v in DATA_SOURCES.items()})
    ACTIVE_COMPOSITE.update(DEFAULT_COMPOSITE)


def composite_months(window: str, lat: float | None = None) -> list[int]:
    """Months inside a composite window, ordered, with the seasons read by hemisphere.

    Dry and wet are properties of the site's climate calendar, not of the northern one: at
    Gweru the rain falls Nov-Apr, so a "wet season" composite asked for in Europe would be
    built from this side's dry months and labelled the opposite of what it measures.
    """
    if window == "annual":
        return list(range(1, 13))
    lat = TARGET_LAT if lat is None else lat
    dry = [5, 6, 7, 8, 9, 10] if lat < 0 else [11, 12, 1, 2, 3, 4]
    wet = [11, 12, 1, 2, 3, 4] if lat < 0 else [5, 6, 7, 8, 9, 10]
    # Ordered so the wrapped half of a season runs continuously across the new year.
    return dry if window == "dry" else wet


def optical_serves(source: str) -> dict:
    """The years and windows an optical coverage publishes: ``years`` is a closed range."""
    return OPTICAL_PRODUCTS[source]


def optical_years(source: str) -> list[int]:
    """Every composite year the selected optical coverage answers a GetCoverage for."""
    lo, hi = optical_serves(source)["years"]
    return list(range(lo, hi + 1))


def optical_credit(source: str) -> str:
    """Who to thank for the optical pixels, for anywhere a report cites its inputs.

    Optical is the one layer with more than one agency behind it, and crediting Copernicus for
    a Landsat median is a false attribution on a document someone signs off on.
    """
    return OPTICAL_PRODUCTS[source]["credit"]


def check_composite(composite: dict | None, sources: dict[str, str] | None = None) -> dict:
    """Validate a composite window against the optical source that has to serve it.

    Returns the complete choice set, so a request that names only a year still says out loud
    which season it was computed over. A year nobody asked for is inherited from the default
    and clamped into what the chosen coverage publishes -- a Landsat 5-7 survey of 2023 is not
    a request anyone made, whereas 2023 spelled out in a payload is, and gets answered with the
    span the product has rather than a median silently fetched from a different decade.
    """
    sources = ACTIVE_SOURCES if sources is None else sources
    optical = sources.get("optical", ACTIVE_SOURCES["optical"])
    served = optical_serves(optical)
    lo, hi = served["years"]
    name = DATA_SOURCES["optical"]["options"][optical]

    year = int(DEFAULT_COMPOSITE["year"])
    chosen = {"year": min(max(year, lo), hi), "window": DEFAULT_COMPOSITE["window"]}
    for key, value in (composite or {}).items():
        if key == "year":
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"composite year {value!r} is not a year")
            if not lo <= value <= hi:
                raise ValueError(
                    f"{name} publishes no {value} composite; this coverage serves {lo}-{hi}"
                )
        elif key == "window":
            if value not in COMPOSITE_WINDOWS:
                raise ValueError(
                    f"'{value}' is not a composite window; choose one of {', '.join(COMPOSITE_WINDOWS)}"
                )
            if value not in served["windows"]:
                raise ValueError(
                    f"{name} publishes only {' and '.join(served['windows'])} composites -- "
                    f"there is no {value} slice to fetch. Sentinel-2 L2A is the source that ships "
                    "scene dates, and seasons are built from those."
                )
        else:
            raise ValueError(f"unknown composite setting '{key}'; the window takes year and window")
        chosen[key] = value
    return chosen


def set_composite(composite: dict | None, sources: dict[str, str] | None = None) -> dict:
    chosen = check_composite(composite, sources)
    ACTIVE_COMPOSITE.update(chosen)
    return chosen


def composite_signature(source: str | None = None, composite: dict | None = None) -> str:
    """The one string that names an optical run: product, year and window together.

    Stored in the provenance sidecar, because a cached raster chosen by coverage alone cannot
    tell a 2023 annual median from a 2024 dry season -- and a score computed from the wrong
    one of those looks exactly like a score computed from the right one.
    """
    source = ACTIVE_SOURCES["optical"] if source is None else source
    composite = ACTIVE_COMPOSITE if composite is None else composite
    return f"{source} {composite['year']} {composite['window']}"


def composite_label(signature: str) -> str:
    """Human wording for a signature, for anywhere a report quotes the input."""
    parts = signature.split()
    if len(parts) != 3:
        return signature
    source, year, window = parts
    base = DATA_SOURCES["optical"]["options"].get(source, source)
    if window == "annual":
        return f"{base}, {year}"
    return f"{base}, {window} season {year}"



def source_labels(sources: dict[str, str] | None = None) -> dict[str, str]:
    """Coverage id -> registry display name, for the places that quote a source to a person."""
    chosen = ACTIVE_SOURCES if sources is None else sources
    return {
        key: DATA_SOURCES[key]["options"][value]
        for key, value in chosen.items()
        if DATA_SOURCES.get(key) and value in DATA_SOURCES[key]["options"]
    }


# Initialize default AOI on import (Gweru, Zimbabwe)
set_target_site()
