"""
Lineament extraction must not turn satellite data voids into structures.

Canny reads the step from a zero-filled void to real backscatter as a sharp
linear gradient, and the density kernels divided line length by total window
area, so void edges produced both phantom lineaments and diluted density.
"""
from __future__ import annotations

import numpy as np
import pytest

import src.config as cfg
from src.utils.lineaments import (
    detect_lineaments,
    extract_edges,
    lineament_density,
    lineament_intersections,
    segment_azimuths,
)


@pytest.fixture()
def small_grid(monkeypatch):
    monkeypatch.setattr(cfg, "HEIGHT", 80, raising=False)
    monkeypatch.setattr(cfg, "WIDTH", 80, raising=False)
    monkeypatch.setattr(cfg, "CELL", 30.0, raising=False)
    return 80


def _field_with_a_fracture(n: int) -> np.ndarray:
    """Smooth backscatter crossed by one genuine linear structure."""
    yy, xx = np.indices((n, n))
    field = np.clip(0.4 + 0.002 * (xx - yy), 0.0, 1.0)
    fracture = np.abs((xx + yy) - n) < 1.5
    field[fracture] = 1.0
    return field.astype("float32")


def test_edges_are_suppressed_around_a_data_void(small_grid):
    n = small_grid
    field = _field_with_a_fracture(n)
    sar = field.copy()
    sar[:, : n // 2] = np.nan
    hillshade = np.where(np.isfinite(sar), field, np.nan).astype("float32")

    edges = extract_edges(sar, hillshade)

    assert edges.dtype == bool
    assert not edges[:, : n // 2].any(), "void interior generated phantom structure"
    assert not edges[:, n // 2 : n // 2 + 4].any(), "void boundary read as a lineament"
    assert edges[:, n // 2 + 10 :].any(), "observed fracture produced no edges at all"

    # Same scene with full coverage: the fracture is detected on both sides,
    # which is what the void-masked run is expected to give up.
    complete = extract_edges(field, field)
    assert complete[:, : n // 2].any(), "reference scene shows no structure either"
    assert complete.sum() > edges.sum()


def test_density_is_per_observed_km2(small_grid):
    n = small_grid
    segments = [((10, n // 2), (n - 10, n // 2))]
    observed = np.ones((n, n), dtype=bool)

    full = lineament_density(segments, kernel_radius_px=5, valid_mask=observed)
    assert np.isfinite(full[n // 2, n - 12])

    # Half the scene has no coverage. Density in the well-covered part is
    # unchanged because the denominator counts observed ground, not window area.
    partial_mask = observed.copy()
    partial_mask[:, : n // 2 - 6] = False
    partial = lineament_density(segments, kernel_radius_px=5, valid_mask=partial_mask)
    assert pytest.approx(partial[n // 2, n - 12], rel=1e-5) == full[n // 2, n - 12]

    # Deep inside the void there is no evidence either way.
    assert np.isnan(partial[n // 2, 2])


def test_density_magnitude_matches_cell_geometry(small_grid):
    n = small_grid
    # A line spanning the full window row occupies 11 of 121 cells in an 11x11 kernel.
    segments = [((0, n // 2), (n - 1, n // 2))]
    dens = lineament_density(segments, kernel_radius_px=5)

    km_per_km2_max = (cfg.CELL / 1000.0) / ((cfg.CELL * cfg.CELL) / 1e6)
    expected = (11.0 / 121.0) * km_per_km2_max
    assert dens[n // 2, n // 2] == pytest.approx(expected, rel=1e-3)


def test_intersections_in_a_void_are_not_counted(small_grid):
    n = small_grid
    segments = [((10, 10), (n - 10, n - 10)), ((10, n - 10), (n - 10, 10))]
    observed = np.ones((n, n), dtype=bool)

    dens_clear, pts_clear = lineament_intersections(segments, kernel_radius_px=5, valid_mask=observed)
    assert len(pts_clear) == 1
    assert dens_clear[n // 2, n // 2] > 0.0

    observed[n // 2 - 3 : n // 2 + 4, n // 2 - 3 : n // 2 + 4] = False
    dens_void, pts_void = lineament_intersections(segments, kernel_radius_px=5, valid_mask=observed)

    assert pts_void == []
    assert dens_void[n // 2, n // 2] == 0.0


def test_segment_azimuths_treat_north_as_up(small_grid):
    segments = [((0, 40), (80, 40)), ((40, 0), (40, 80))]
    azimuths = segment_azimuths(segments)

    assert azimuths[0] == pytest.approx(90.0)  # east-west strike
    assert azimuths[1] == pytest.approx(0.0)   # north-south strike


def test_detect_lineaments_returns_nothing_without_edges(small_grid):
    mask = np.zeros((small_grid, small_grid), dtype=bool)
    assert detect_lineaments(mask) == []
