"""
SiteSurveyor AI — Raster Utilities
====================================
Shared functions for loading, reprojecting, normalizing, and writing rasters.
"""
from __future__ import annotations

from pathlib import Path
import src.config as cfg

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject


def warp(path: Path, band: int | str = 1, resampling: Resampling = Resampling.bilinear,
         scale: float = 1.0) -> np.ndarray:
    """
    Load a single band from a GeoTIFF and reproject it onto the active
    metric grid defined in config.

    Args:
        path: Path to source GeoTIFF
        band: 1-based band index, or the band's name as the file records it
        resampling: Resampling method
        scale: Divide raw values by this (e.g., 10000 for Sentinel-2 SR)

    Returns:
        2D float32 array (HEIGHT × WIDTH) with NaN for nodata
    """
    with rasterio.open(path) as src:
        if isinstance(band, str):
            names = list(src.descriptions or ())
            if band not in names:
                raise LookupError(
                    f"{path.name} has no band named '{band}' -- it carries "
                    f"{', '.join(n for n in names if n) or 'no band names'}. "
                    "Reading the nearest index instead would score a different "
                    "part of the spectrum and never say so."
                )
            band = names.index(band) + 1
        arr = src.read(band).astype("float32") / scale
        nd = src.nodata
        if nd is not None:
            arr[arr == nd / scale] = np.nan
        dst = np.full((cfg.HEIGHT, cfg.WIDTH), np.nan, dtype="float32")
        reproject(
            source=arr,
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=np.nan,
            dst_transform=cfg.TRANSFORM,
            dst_crs=cfg.LOCAL_CRS,
            dst_nodata=np.nan,
            resampling=resampling,
            num_threads=2,
        )
    return dst


def robust_norm(a: np.ndarray, lo: float = 2, hi: float = 98) -> np.ndarray:
    """
    Robust min-max normalization using percentile clipping.

    Args:
        a: Input array (may contain NaN)
        lo: Lower percentile for clipping
        hi: Upper percentile for clipping

    Returns:
        Array normalized to [0, 1] range, NaN preserved
    """
    valid = a[np.isfinite(a)]
    if len(valid) == 0:
        # Zero would read as "confidently lowest"; an unobserved layer has no value.
        return np.full(a.shape, np.nan, dtype="float32")
    p_lo, p_hi = np.percentile(valid, [lo, hi])
    return np.clip((a - p_lo) / (p_hi - p_lo + 1e-9), 0, 1)


def write_raster(path: Path, data: np.ndarray, dtype: str = "float32",
                 nodata: float | None = None, count: int = 1) -> None:
    """
    Write a 2D or 3D array to a GeoTIFF on the common grid.

    Args:
        path: Output file path
        data: 2D (H, W) or 3D (C, H, W) array
        dtype: Output data type string
        nodata: Nodata value
        count: Number of bands (auto-detected from 3D arrays)
    """
    if data.ndim == 3:
        count = data.shape[0]

    with rasterio.open(
        path, "w", driver="GTiff",
        height=cfg.HEIGHT, width=cfg.WIDTH, count=count,
        dtype=dtype, crs=cfg.LOCAL_CRS, transform=cfg.TRANSFORM,
        nodata=nodata, compress="deflate",
    ) as dst:
        if data.ndim == 2:
            dst.write(data.astype(dtype), 1)
        else:
            for i in range(count):
                dst.write(data[i].astype(dtype), i + 1)


def pixel_to_lonlat(row: int, col: int) -> tuple[float, float]:
    """Convert pixel row/col to WGS84 lon/lat."""
    x = cfg.XMIN + (col + 0.5) * cfg.CELL
    y = cfg.YMAX - (row + 0.5) * cfg.CELL
    lon, lat = cfg.TO_WGS.transform(x, y)
    return float(lon), float(lat)


def lonlat_to_pixel(lon: float, lat: float) -> tuple[int, int]:
    """Convert WGS84 lon/lat to pixel row/col."""
    x, y = cfg.TO_LOCAL.transform(lon, lat)
    col = int((x - cfg.XMIN) / cfg.CELL)
    row = int((cfg.YMAX - y) / cfg.CELL)
    return row, col


def safe_savefig(fig, path: Path, dpi: int | None = None, retries: int = 4) -> None:
    if dpi is None:
        dpi = cfg.MAP_DPI
    """
    Save a matplotlib figure, retrying transient Windows file locks.

    A map that never reaches disk must fail loudly: silently dropping a
    deliverable leaves the report pointing at a file that does not exist.
    """
    import os
    import time

    last_err: OSError | None = None
    for attempt in range(retries):
        try:
            fig.savefig(path, dpi=dpi)
            return
        except OSError as e:
            last_err = e
            time.sleep(0.4 * (attempt + 1))

    tmp_path = path.with_name(f"{path.stem}_{int(time.time())}{path.suffix}")
    try:
        fig.savefig(tmp_path, dpi=dpi)
        os.replace(tmp_path, path)
    except (OSError, RuntimeError) as e:
        raise RuntimeError(f"Failed to write map figure to {path}: {e}") from e
