"""
SiteSurveyor AI — Gravimetric & Density Anomaly Modeling
========================================================

Reads whatever Bouguer gravity grid has been provisioned into `data/external/` and
derives three products from it:

1. Bouguer Anomaly (mGal): the field as supplied.
2. Residual anomaly (mGal): the field minus a fitted regional surface, which is the
   part that carries exploration-scale density contrast.
3. Horizontal Gradient Magnitude (mGal/km): edge detection for density contacts.

What the numbers are worth depends entirely on the input, so the input has to declare
itself. A raster tagged `SITESURVEYOR_KIND=measured` with a citation is a survey and may
carry model weight. The grid this repository ships is `modelled` — an analytic
calibration field written by `scripts/provision_gravity.py`, not a measurement — and an
untagged file is `unverified`. Neither is scored, because a fabricated field must not
quietly become evidence in a prospectivity number someone acts on. Both still produce
maps and readouts, labelled as what they are.

Note also that the shipped grid is ~2.2 km posting upsampled onto the 30 m analysis
grid: the residual and gradient are interpolated surfaces, not 30 m observations, and
should not be read at pixel scale.

Degrades gracefully: with no gravimetric raster present the engine runs on structural
(ALOS PALSAR) and multi-spectral (Sentinel-2) layers alone without raising.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import TypedDict

import numpy as np

import src.config as cfg
from src.utils.raster import robust_norm, warp

logger = logging.getLogger("sitesurveyor.gravity")

GRAVITY_CANDIDATE_FILENAMES = (
    "bouguer_gravity.tif",
    "bouguer_africa.tif",
    "wgm2012_bouguer.tif",
    "gravity.tif",
)

GRAVITY_ZONE_NAMES: dict[int, str] = {
    1: "High-Density Core (Mafic-Ultramafic / BIF / Massive Sulphide)",
    2: "Dense Mafic (Greenstone Assemblage / Basalt-Amphibolite)",
    3: "Intermediate Basement (Gneiss / Granodiorite)",
    4: "Low-Density Felsic (Granite / Pegmatite Embayment)",
    5: "Major Structural Shear Contact (Steep Density Fault)",
}

GRAVITY_ZONE_PALETTE: list[str] = [
    "#00000000",  # 0: No data / unclassified
    "#b91c1c",    # 1: High-Density Core (deep red)
    "#f59e0b",    # 2: Dense Mafic Greenstone (amber)
    "#64748b",    # 3: Intermediate Basement (slate)
    "#0284c7",    # 4: Low-Density Felsic (sky blue)
    "#7c3aed",    # 5: Major Structural Shear Contact (purple)
]

# A percentile threshold always selects its top fraction, even from a field with no
# signal in it: a flat Bouguer grid has residual 0 and gradient 0 everywhere, and
# ranking that still painted the whole AOI "Major Structural Shear Contact". These are
# the floors below which a class is not interpretable. 0.1 mGal is the precision of a
# good terrestrial Bouguer compilation and far beneath the several-mGal formal error of
# a satellite-only model; 0.05 mGal/km is that same 0.1 mGal spread across one ~2 km
# source cell. The gradient floor is a contrast above the background, not a level: a
# uniform gradient is a regional tilt, and a tilt has no contacts in it. Below either
# floor the honest answer is unclassified, not a confident tier.
MIN_RESIDUAL_IQR_MGAL = 0.1
MIN_GRADIENT_CONTRAST_MGAL_KM = 0.05

# Six polynomial coefficients are massively overdetermined by 20k samples. Fitting the
# full design matrix instead cost 165 MiB of transient allocation on a 0.77M-pixel AOI,
# inside a container documented at 512 MB.
MAX_FIT_SAMPLES = 20_000

# What a gravity raster has to say about itself before anyone trusts it. Absent tags
# read as "unverified", never as "measured": an unnamed file must not earn its way into
# a prospectivity score by silence.
TAG_KIND = "SITESURVEYOR_KIND"
TAG_CITATION = "SITESURVEYOR_CITATION"
KIND_MEASURED = "measured"
KIND_MODELLED = "modelled"
KIND_UNVERIFIED = "unverified"


class GravityData(TypedDict):
    active: bool
    source_file: str | None
    source_kind: str
    source_citation: str
    scoreable: bool
    raw_bouguer: np.ndarray | None
    norm_bouguer: np.ndarray | None
    regional_bouguer: np.ndarray | None
    residual_bouguer: np.ndarray | None
    norm_residual: np.ndarray | None
    raw_gradient: np.ndarray | None
    norm_gradient: np.ndarray | None
    zones: np.ndarray | None
    zone_names: dict[int, str]


def read_source_tags(path: Path) -> tuple[str, str]:
    """The kind and citation a gravity raster declares, defaulting to unverified."""
    import rasterio

    with rasterio.open(path) as ds:
        tags = ds.tags()
    kind = (tags.get(TAG_KIND) or "").strip().lower()
    if kind not in (KIND_MEASURED, KIND_MODELLED):
        kind = KIND_UNVERIFIED
    return kind, (tags.get(TAG_CITATION) or "").strip()


def source_label(data: GravityData) -> str:
    """One factual line naming the gravity field and whether it scored.

    Shared by the report, the dossier and the dashboard so the three cannot describe
    the same input differently.
    """
    if not data["active"]:
        return "No gravity raster — structural and spectral baseline only"
    citation = data["source_citation"] or data["source_file"] or "unnamed raster"
    if data["scoreable"]:
        return f"{citation} — measured survey, scored"
    if data["source_kind"] == KIND_MODELLED:
        return f"{citation} — modelled field, not a measurement; excluded from scoring"
    return f"{citation} — source unverified; excluded from scoring"


def _poly_design(nx: np.ndarray, ny: np.ndarray, order: int) -> np.ndarray:
    """Design matrix for the regional surface, columns in coefficient order."""
    cols = [np.ones_like(nx), nx, ny]
    if order == 2:
        cols += [nx * nx, nx * ny, ny * ny]
    return np.column_stack(cols)


def regional_residual_separation(
    grid: np.ndarray,
    order: int = 2,
) -> tuple[np.ndarray, np.ndarray]:
    """Separate Bouguer gravity into regional trend and local residual anomaly.

    Uses 2D polynomial surface fitting (order 1 planar or order 2 quadratic).
    g_raw = g_regional + g_residual
    g_residual = g_raw - g_regional

    Positive residuals highlight dense mafic/ultramafic rocks, massive sulfides,
    and ironstones. Negative residuals delineate felsic granites and pegmatite
    embayments.
    """
    if not isinstance(grid, np.ndarray) or grid.ndim != 2:
        raise ValueError("grid must be a 2D numpy array")
    if order not in (1, 2):
        raise ValueError(f"order must be 1 (planar) or 2 (quadratic), got {order!r}")

    h, w = grid.shape
    finite = np.isfinite(grid)
    if np.count_nonzero(finite) < 10:
        return (
            np.full_like(grid, np.nan, dtype="float32"),
            np.full_like(grid, np.nan, dtype="float32"),
        )

    # Evenly spread rather than random, so the same AOI always yields the same surface.
    idx = np.flatnonzero(finite)
    if idx.size > MAX_FIT_SAMPLES:
        idx = idx[np.linspace(0, idx.size - 1, MAX_FIT_SAMPLES).astype(np.intp)]
    rows, cols = np.divmod(idx, w)
    sx = 2.0 * cols / max(w - 1, 1) - 1.0
    sy = 2.0 * rows / max(h - 1, 1) - 1.0

    coeffs, _, _, _ = np.linalg.lstsq(
        _poly_design(sx, sy, order), grid[rows, cols].astype("float64"), rcond=None
    )

    # Broadcasting a row vector against a column vector evaluates the surface without
    # ever materialising a full-grid basis array per term.
    nx = (2.0 * np.arange(w, dtype="float64") / max(w - 1, 1) - 1.0)[None, :]
    ny = (2.0 * np.arange(h, dtype="float64") / max(h - 1, 1) - 1.0)[:, None]
    surface = np.empty((h, w), dtype="float64")
    surface[:] = coeffs[0]
    surface += coeffs[1] * nx
    surface += coeffs[2] * ny
    if order == 2:
        surface += coeffs[3] * (nx * nx)
        surface += coeffs[4] * nx * ny
        surface += coeffs[5] * (ny * ny)

    regional = surface.astype("float32")
    residual = (grid - regional).astype("float32")
    regional[~finite] = np.nan
    residual[~finite] = np.nan
    return regional, residual


def classify_gravity_zones(
    residual: np.ndarray,
    gradient: np.ndarray,
) -> tuple[np.ndarray, dict[int, str]]:
    """Classify the survey area into gravimetric exploration zones.

    Returns an array of uint8 zone codes and zone labels:
    1: High-Density Core (Mafic-Ultramafic / BIF / Massive Sulphide)
    2: Dense Mafic (Greenstone Assemblage / Basalt-Amphibolite)
    3: Intermediate Basement (Gneiss / Granodiorite)
    4: Low-Density Felsic (Granite / Pegmatite Embayment)
    5: Major Structural Shear Contact (Steep Density Fault)

    Code 0 is unclassified: no data, or a field with too little contrast to carry a
    density interpretation. A percentile always selects its top fraction, so without
    the contrast floors a perfectly flat grid reads as one enormous shear contact.
    """
    if not isinstance(residual, np.ndarray) or not isinstance(gradient, np.ndarray):
        raise ValueError("residual and gradient must be 2D numpy arrays")
    if residual.ndim != 2 or gradient.ndim != 2:
        raise ValueError("residual and gradient must be 2D numpy arrays")
    if residual.shape != gradient.shape:
        raise ValueError(
            f"residual {residual.shape} and gradient {gradient.shape} must share one grid"
        )

    zones = np.zeros(residual.shape, dtype="uint8")
    res_valid = np.isfinite(residual)
    grad_valid = np.isfinite(gradient)
    if not np.any(res_valid) or not np.any(grad_valid):
        return zones, GRAVITY_ZONE_NAMES

    p25, p75 = np.percentile(residual[res_valid], [25, 75])
    if p75 - p25 >= MIN_RESIDUAL_IQR_MGAL:
        # Sign says excess or deficit mass; magnitude ranks within that. Cutting a
        # whole-field percentile at zero instead let a population that sat entirely on
        # one side of zero label excess mass "Low-Density Felsic".
        positive = res_valid & (residual > 0)
        negative = res_valid & (residual < 0)
        if np.any(positive):
            cut = float(np.percentile(residual[positive], 75))
            zones[positive & (residual >= cut)] = 1
            zones[positive & (residual < cut)] = 2
        if np.any(negative):
            cut = float(np.percentile(residual[negative], 25))
            zones[negative & (residual <= cut)] = 4
            zones[negative & (residual > cut)] = 3

    p50_grad, p85_grad = np.percentile(gradient[grad_valid], [50, 85])
    if p85_grad - p50_grad >= MIN_GRADIENT_CONTRAST_MGAL_KM:
        zones[grad_valid & (gradient >= p85_grad)] = 5

    return zones, GRAVITY_ZONE_NAMES


def horizontal_gradient_magnitude(
    grid: np.ndarray,
    cell_size_m: float | None = None,
) -> np.ndarray:
    """Compute the Horizontal Gradient Magnitude (HGM) of a 2D gravity raster.

    HGM = sqrt((dg/dx)^2 + (dg/dy)^2)

    Standard geophysical edge detection method for mapping density contacts and
    subsurface fault boundaries. Returned in mGal/km on the active survey grid.
    """
    if not isinstance(grid, np.ndarray) or grid.ndim != 2:
        raise ValueError("grid must be a 2D numpy array")

    finite_mask = np.isfinite(grid)
    if not np.any(finite_mask):
        return np.full_like(grid, np.nan, dtype="float32")

    if cell_size_m is None:
        cell_size_m = cfg.CELL

    # The infill only gives np.gradient numbers to read; every cell whose stencil
    # touched it is invalidated below, so the fill value never reaches the output.
    filled = np.where(finite_mask, grid, float(np.median(grid[finite_mask])))
    gy, gx = np.gradient(filled.astype("float64"), cell_size_m)
    hgm = np.hypot(gx, gy)

    # Each 1D derivative reads one cell either side, so a no-data cell contaminates its
    # four neighbours as well as itself. Masking only the no-data cells left a coverage
    # edge reading 15.8 mGal/km against a 1.7 mGal/km interior, which then consumed the
    # top-gradient budget and was mapped as a major shear contact that does not exist.
    invalid = ~finite_mask
    contaminated = invalid.copy()
    contaminated[1:, :] |= invalid[:-1, :]
    contaminated[:-1, :] |= invalid[1:, :]
    contaminated[:, 1:] |= invalid[:, :-1]
    contaminated[:, :-1] |= invalid[:, 1:]

    # Convert gradient to mGal/km for standard geophysical interpretation
    hgm_mgal_per_km = (hgm * 1000.0).astype("float32")
    hgm_mgal_per_km[contaminated] = np.nan
    return hgm_mgal_per_km


def find_gravity_raster() -> Path | None:
    """Locate an available Bouguer gravity raster in external or raw directories."""
    search_dirs = [
        cfg.EXTERNAL,
        cfg.RAW,
        cfg.ROOT / "data" / "external",
        cfg.ROOT / "data",
    ]
    for d in search_dirs:
        if not d.is_dir():
            continue
        for name in GRAVITY_CANDIDATE_FILENAMES:
            candidate = d / name
            if candidate.is_file() and candidate.stat().st_size > 0:
                return candidate
    return None


def _inactive(
    source_file: str | None = None,
    source_kind: str = KIND_UNVERIFIED,
    source_citation: str = "",
) -> GravityData:
    """The degraded state: no usable gravity, and no claim about what it was."""
    return GravityData(
        active=False,
        source_file=source_file,
        source_kind=source_kind,
        source_citation=source_citation,
        scoreable=False,
        raw_bouguer=None,
        norm_bouguer=None,
        regional_bouguer=None,
        residual_bouguer=None,
        norm_residual=None,
        raw_gradient=None,
        norm_gradient=None,
        zones=None,
        zone_names=GRAVITY_ZONE_NAMES,
    )


def load_gravity_layers() -> GravityData:
    """Load, warp, and normalize Bouguer gravity, residual anomaly, and gradient for the survey AOI.

    Reprojects onto the active metric grid in `src.config`, which is the AOI.
    Returns a GravityData dictionary. If no file is found, `active` is False and
    arrays are None, allowing the caller to degrade gracefully. `scoreable` is True
    only for a raster that declares itself a measured survey.
    """
    raster_path = find_gravity_raster()
    if raster_path is None:
        return _inactive()

    try:
        kind, citation = read_source_tags(raster_path)
        raw_b = warp(raster_path, 1)
        if not np.any(np.isfinite(raw_b)):
            return _inactive(raster_path.name, kind, citation)

        norm_b = robust_norm(raw_b)
        reg_b, res_b = regional_residual_separation(raw_b, order=2)
        norm_res = robust_norm(res_b)
        raw_grad = horizontal_gradient_magnitude(raw_b)
        norm_grad = robust_norm(raw_grad)
        zones, zone_names = classify_gravity_zones(res_b, raw_grad)

        return GravityData(
            active=True,
            source_file=raster_path.name,
            source_kind=kind,
            source_citation=citation,
            scoreable=kind == KIND_MEASURED,
            raw_bouguer=raw_b,
            norm_bouguer=norm_b,
            regional_bouguer=reg_b,
            residual_bouguer=res_b,
            norm_residual=norm_res,
            raw_gradient=raw_grad,
            norm_gradient=norm_grad,
            zones=zones,
            zone_names=zone_names,
        )
    except Exception as exc:
        logger.warning("Could not load gravity raster %s: %s", raster_path.name, exc)
        return _inactive(raster_path.name)
