"""
SiteSurveyor AI — Gravimetric & Density Anomaly Modeling
========================================================

Integrates high-resolution Bouguer gravity anomaly models (e.g. from EIGEN-6C4,
WGM2012, or GOCE-derived global models) into the mineral exploration pipeline:

1. Bouguer Anomaly (mGal): Surface terrain mass is removed to expose subsurface
   density contrasts. Positive anomalies highlight dense mafic/ultramafic rocks,
   massive sulfide bodies, ironstones, and alkaline/carbonatite complexes.
2. Horizontal Gradient Magnitude (|∇g|): Horizontal gravity derivatives pinpoint
   deep-seated crustal shear zones, tectonic contacts, and basement fault corridors
   that act as hydrothermal fluid pathways.

Degrades gracefully: if no gravimetric raster is present in `data/external/`,
the engine operates seamlessly on structural (ALOS PALSAR) and multi-spectral (Sentinel-2)
layers without throwing an error.
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


class GravityData(TypedDict):
    active: bool
    source_file: str | None
    raw_bouguer: np.ndarray | None
    norm_bouguer: np.ndarray | None
    regional_bouguer: np.ndarray | None
    residual_bouguer: np.ndarray | None
    norm_residual: np.ndarray | None
    raw_gradient: np.ndarray | None
    norm_gradient: np.ndarray | None
    zones: np.ndarray | None
    zone_names: dict[int, str]


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

    h, w = grid.shape
    finite = np.isfinite(grid)
    if np.count_nonzero(finite) < 10:
        return np.full_like(grid, np.nan, dtype="float32"), np.full_like(grid, np.nan, dtype="float32")

    y, x = np.mgrid[0:h, 0:w]
    ny = 2.0 * y / max(h - 1, 1) - 1.0
    nx = 2.0 * x / max(w - 1, 1) - 1.0

    if order == 1:
        basis = [np.ones_like(nx), nx, ny]
    else:
        basis = [np.ones_like(nx), nx, ny, nx**2, nx * ny, ny**2]

    A_all = np.column_stack([b.ravel() for b in basis])
    A_fit = A_all[finite.ravel()]
    obs_fit = grid.ravel()[finite.ravel()].astype("float64")

    coeffs, _, _, _ = np.linalg.lstsq(A_fit, obs_fit, rcond=None)
    regional = (A_all @ coeffs).reshape(h, w).astype("float32")
    residual = (grid - regional).astype("float32")
    regional[~finite] = np.nan
    residual[~finite] = np.nan
    return regional, residual


def classify_gravity_zones(
    residual: np.ndarray,
    gradient: np.ndarray,
) -> tuple[np.ndarray, dict[int, str]]:
    """Classify the survey area into gravimetric exploration zones.

    Returns an array of uint8 zone codes (1-5) and zone labels:
    1: High-Density Core (Mafic-Ultramafic / BIF / Massive Sulphide)
    2: Dense Mafic (Greenstone Assemblage / Basalt-Amphibolite)
    3: Intermediate Basement (Gneiss / Granodiorite)
    4: Low-Density Felsic (Granite / Pegmatite Embayment)
    5: Major Structural Shear Contact (Steep Density Fault)
    """
    if not isinstance(residual, np.ndarray) or not isinstance(gradient, np.ndarray):
        raise ValueError("residual and gradient must be 2D numpy arrays")

    h, w = residual.shape
    zones = np.zeros((h, w), dtype="uint8")

    res_finite = residual[np.isfinite(residual)]
    grad_finite = gradient[np.isfinite(gradient)]
    if res_finite.size == 0 or grad_finite.size == 0:
        return zones, GRAVITY_ZONE_NAMES

    p75_res = float(np.percentile(res_finite, 75))
    p25_res = float(np.percentile(res_finite, 25))

    # Base density regimes
    zones[(residual >= 0) & (residual < p75_res)] = 2  # Dense Mafic Greenstone
    zones[residual >= p75_res] = 1                     # High-Density Core
    zones[(residual < 0) & (residual >= p25_res)] = 3  # Intermediate Basement
    zones[residual < p25_res] = 4                      # Low-Density Felsic / Pegmatite

    # Overlay major structural shear contacts (top 15% gradient)
    p85_grad = float(np.percentile(grad_finite, 85))
    zones[gradient >= p85_grad] = 5                    # Major Structural Contact

    return zones, GRAVITY_ZONE_NAMES


def horizontal_gradient_magnitude(
    grid: np.ndarray,
    cell_size_m: float = 30.0,
) -> np.ndarray:
    """Compute the Horizontal Gradient Magnitude (HGM) of a 2D gravity raster.

    HGM = sqrt((dg/dx)^2 + (dg/dy)^2)

    Standard geophysical edge detection method for mapping density contacts and
    subsurface fault boundaries.
    """
    if not isinstance(grid, np.ndarray) or grid.ndim != 2:
        raise ValueError("grid must be a 2D numpy array")

    finite_mask = np.isfinite(grid)
    if not np.any(finite_mask):
        return np.full_like(grid, np.nan, dtype="float32")

    # Infill NaNs temporarily for smooth gradient calculation
    fill_value = float(np.nanmedian(grid[finite_mask]))
    filled = np.where(finite_mask, grid, fill_value)

    gy, gx = np.gradient(filled.astype("float64"), cell_size_m)
    hgm = np.hypot(gx, gy)

    # Convert gradient to mGal/km for standard geophysical interpretation
    hgm_mgal_per_km = (hgm * 1000.0).astype("float32")
    hgm_mgal_per_km[~finite_mask] = np.nan
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


def load_gravity_layers(
    bbox: tuple[float, float, float, float] | None = None,
    shape: tuple[int, int] | None = None,
) -> GravityData:
    """Load, warp, and normalize Bouguer gravity, residual anomaly, and gradient for the survey AOI.

    Returns a GravityData dictionary. If no file is found, `active` is False and
    arrays are None, allowing the caller to degrade gracefully.
    """
    raster_path = find_gravity_raster()
    if raster_path is None:
        return GravityData(
            active=False,
            source_file=None,
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

    try:
        raw_b = warp(raster_path, 1)
        if not np.any(np.isfinite(raw_b)):
            return GravityData(
                active=False,
                source_file=raster_path.name,
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

        norm_b = robust_norm(raw_b)
        reg_b, res_b = regional_residual_separation(raw_b, order=2)
        norm_res = robust_norm(res_b)
        raw_grad = horizontal_gradient_magnitude(raw_b, cell_size_m=30.0)
        norm_grad = robust_norm(raw_grad)
        zones, zone_names = classify_gravity_zones(res_b, raw_grad)

        return GravityData(
            active=True,
            source_file=raster_path.name,
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
        return GravityData(
            active=False,
            source_file=raster_path.name,
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
