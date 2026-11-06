"""
SiteSurveyor AI — Spectral Utilities
=====================================
Multi-spectral and alteration index algorithms for Sentinel-2 / ASTER:
NDVI, NDMI, NDWI, Iron Oxide, Hydroxyl/Clay, Ferrous, Gossan, and
vegetation residual regression.
"""
from __future__ import annotations

import numpy as np


def _norm_ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    """Normalized-difference ratio: (num / den), clipped to [-1, 1].

    A zero denominator is unmeasured ground, so the cell becomes NaN rather than
    infinite. errstate is needed because np.where evaluates both branches -- a
    fully void scene would otherwise bury the server log in 0/0 warnings.
    """
    with np.errstate(invalid="ignore", divide="ignore"):
        idx = np.where(den != 0, num / den, np.nan)
    return np.clip(idx, -1.0, 1.0).astype("float32")


def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Normalized Difference Vegetation Index = (NIR - Red) / (NIR + Red)."""
    return _norm_ratio(nir - red, nir + red)


def ndmi(nir: np.ndarray, swir1: np.ndarray) -> np.ndarray:
    """Normalized Difference Moisture Index = (NIR - SWIR1) / (NIR + SWIR1)."""
    return _norm_ratio(nir - swir1, nir + swir1)


def ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Normalized Difference Water Index = (Green - NIR) / (Green + NIR)."""
    return _norm_ratio(green - nir, green + nir)


def iron_oxide_index(red: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Iron Oxide Index = (Red - Blue) / (Red + Blue) or Red / Blue."""
    return _norm_ratio(red - blue, red + blue)


def gossan_index(swir1: np.ndarray, red: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Gossan Index = (SWIR1 / Red) * (Red / Blue). Weathered sulfide indicator."""
    with np.errstate(invalid="ignore", divide="ignore"):
        ratio1 = np.where(red > 0.001, swir1 / red, np.nan)
        ratio2 = np.where(blue > 0.001, red / blue, np.nan)
        idx = ratio1 * ratio2
    return idx.astype("float32")


def hydroxyl_index(swir1: np.ndarray, swir2: np.ndarray) -> np.ndarray:
    """Hydroxyl / Clay Alteration Index = (SWIR1 - SWIR2) / (SWIR1 + SWIR2)."""
    return _norm_ratio(swir1 - swir2, swir1 + swir2)


def ferrous_index(swir1: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Ferrous / Mafic Silicate Index = (SWIR1 - NIR) / (SWIR1 + NIR)."""
    return _norm_ratio(swir1 - nir, swir1 + nir)


def bare_soil_index(red: np.ndarray, swir1: np.ndarray, nir: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Bare Soil Index (BSI) = ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))."""
    return _norm_ratio((swir1 + red) - (nir + blue), (swir1 + red) + (nir + blue))


def residual_index(index_arr: np.ndarray, ndvi_arr: np.ndarray, deg: int = 2) -> np.ndarray:
    """
    Remove vegetation influence from mineral / moisture indices using polynomial regression.
    Residual = Observed Index - Predicted Index(NDVI).

    Returns NaN where no fit was possible: passing the raw index through would label an
    undetrended ratio as a vegetation residual, which is what downstream weights assume.
    """
    valid = np.isfinite(index_arr) & np.isfinite(ndvi_arr)
    n_valid = int(np.sum(valid))
    if n_valid < 100:
        print(f"  [warn] residual_index: only {n_valid} jointly observed pixels (<100); "
              f"no vegetation detrend fitted, residual returned as no-data")
        return np.full(index_arr.shape, np.nan, dtype="float32")

    x = ndvi_arr[valid]
    y = index_arr[valid]

    # Sample for robust polynomial fitting if array is large
    if len(x) > 50000:
        # Evenly spaced through NDVI order, not randomly drawn: a fresh random
        # subsample gave the same site different alteration residuals on every run.
        order = np.argsort(x, kind="stable")
        sample_idx = order[np.linspace(0, len(x) - 1, 50000, dtype=np.int64)]
        xs, ys = x[sample_idx], y[sample_idx]
    else:
        xs, ys = x, y

    coeffs = np.polyfit(xs, ys, deg=deg)
    pred = np.polyval(coeffs, ndvi_arr)

    residual = index_arr - pred
    return residual.astype("float32")

