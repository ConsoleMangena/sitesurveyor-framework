"""
Tests for gravimetric modeling and horizontal gradient calculation.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is in sys.path and config is imported FIRST to initialize PROJ_DATA
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import src.config as cfg

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from src.utils.gravity import (
    horizontal_gradient_magnitude,
    load_gravity_layers,
    find_gravity_raster,
)


def test_horizontal_gradient_magnitude_flat() -> None:
    """A completely flat gravity field has zero horizontal gradient."""
    grid = np.full((20, 20), 15.0, dtype="float32")
    hgm = horizontal_gradient_magnitude(grid, cell_size_m=30.0)
    assert hgm.shape == (20, 20)
    assert np.allclose(hgm, 0.0, atol=1e-5)


def test_horizontal_gradient_magnitude_linear_ramp() -> None:
    """A linear ramp has a constant horizontal gradient."""
    # 1 mGal per 100 meters = 10 mGal/km along x axis
    x = np.linspace(0, 10, 21, dtype="float32")  # 21 points, 0.5 mGal step
    grid = np.tile(x, (20, 1))
    hgm = horizontal_gradient_magnitude(grid, cell_size_m=50.0)
    # df/dx = 0.5 / 50.0 = 0.01 mGal/m = 10.0 mGal/km
    assert np.allclose(hgm[:, 1:-1], 10.0, atol=1e-3)


def test_horizontal_gradient_handles_nans() -> None:
    """NaNs in input do not crash and remain NaN in output."""
    grid = np.full((10, 10), 5.0, dtype="float32")
    grid[3, 3] = np.nan
    hgm = horizontal_gradient_magnitude(grid, cell_size_m=30.0)
    assert np.isnan(hgm[3, 3])
    assert np.all(np.isfinite(hgm[np.isfinite(grid)]))


def test_load_gravity_layers_when_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When no external gravity raster is found, returns clean degraded state."""
    monkeypatch.setattr(cfg, "EXTERNAL", tmp_path / "empty_ext")
    monkeypatch.setattr(cfg, "RAW", tmp_path / "empty_raw")
    data = load_gravity_layers()
    assert data["active"] is False
    assert data["source_file"] is None
    assert data["raw_bouguer"] is None
    assert data["norm_bouguer"] is None
    assert data["raw_gradient"] is None
    assert data["norm_gradient"] is None


def test_load_gravity_layers_when_present(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When a valid GeoTIFF is provided in EXTERNAL, warps and normalizes it."""
    ext_dir = tmp_path / "external"
    ext_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(cfg, "EXTERNAL", ext_dir)

    tif_path = ext_dir / "bouguer_gravity.tif"
    # Create a small valid GeoTIFF on WGS84
    h, w = 10, 10
    synth = np.linspace(-30.0, 40.0, h * w, dtype="float32").reshape((h, w))
    transform = from_origin(cfg.BBOX_WGS84[0], cfg.BBOX_WGS84[3], 0.01, 0.01)

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
    ) as ds:
        ds.write(synth, 1)

    data = load_gravity_layers()
    assert data["active"] is True
    assert data["source_file"] == "bouguer_gravity.tif"
    assert data["raw_bouguer"] is not None
    assert data["norm_bouguer"] is not None
    assert data["norm_gradient"] is not None
    assert data["norm_bouguer"].shape == (cfg.HEIGHT, cfg.WIDTH)
    assert np.nanmin(data["norm_bouguer"]) >= 0.0
    assert np.nanmax(data["norm_bouguer"]) <= 1.0
