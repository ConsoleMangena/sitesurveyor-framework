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


class GravityData(TypedDict):
    active: bool
    source_file: str | None
    raw_bouguer: np.ndarray | None
    norm_bouguer: np.ndarray | None
    raw_gradient: np.ndarray | None
    norm_gradient: np.ndarray | None


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
    """Load, warp, and normalize Bouguer gravity and gradient for the survey AOI.

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
            raw_gradient=None,
            norm_gradient=None,
        )

    try:
        raw_b = warp(raster_path, 1)
        if not np.any(np.isfinite(raw_b)):
            return GravityData(
                active=False,
                source_file=raster_path.name,
                raw_bouguer=None,
                norm_bouguer=None,
                raw_gradient=None,
                norm_gradient=None,
            )

        norm_b = robust_norm(raw_b)
        raw_grad = horizontal_gradient_magnitude(raw_b, cell_size_m=30.0)
        norm_grad = robust_norm(raw_grad)

        return GravityData(
            active=True,
            source_file=raster_path.name,
            raw_bouguer=raw_b,
            norm_bouguer=norm_b,
            raw_gradient=raw_grad,
            norm_gradient=norm_grad,
        )
    except Exception as exc:
        logger.warning("Could not load gravity raster %s: %s", raster_path.name, exc)
        return GravityData(
            active=False,
            source_file=raster_path.name,
            raw_bouguer=None,
            norm_bouguer=None,
            raw_gradient=None,
            norm_gradient=None,
        )
