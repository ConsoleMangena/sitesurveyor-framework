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
    read_source_tags,
    regional_residual_separation,
    classify_gravity_zones,
    source_label,
    GRAVITY_ZONE_NAMES,
    KIND_MEASURED,
    KIND_MODELLED,
    KIND_UNVERIFIED,
    TAG_CITATION,
    TAG_KIND,
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
    """No-data invalidates the cells whose derivative stencil reads it, not just itself."""
    grid = np.full((10, 10), 5.0, dtype="float32")
    grid[3, 3] = np.nan
    hgm = horizontal_gradient_magnitude(grid, cell_size_m=30.0)

    assert np.isnan(hgm[3, 3])
    # np.gradient reads one cell either side along each axis independently.
    for row, col in ((2, 3), (4, 3), (3, 2), (3, 4)):
        assert np.isnan(hgm[row, col]), (row, col)
    # The diagonal is outside both stencils, so it must survive.
    assert np.isfinite(hgm[2, 2])
    assert np.isfinite(hgm[4, 4])
    assert np.all(np.isfinite(hgm[6:, 6:]))


def test_regional_residual_separation() -> None:
    """A crustal regional ramp is subtracted cleanly, leaving a localized bullseye."""
    h, w = 30, 30
    y, x = np.mgrid[0:h, 0:w]
    regional_synth = 0.5 * x + 0.3 * y - 100.0  # Regional plane
    # Add a localized positive anomaly (e.g. dense orebody at center)
    dist = np.hypot(x - 15, y - 15)
    local_target = 8.0 * np.exp(-0.5 * (dist / 3.0) ** 2)
    composite = (regional_synth + local_target).astype("float32")

    reg, res = regional_residual_separation(composite, order=1)
    assert reg.shape == (h, w)
    assert res.shape == (h, w)
    # Residual should peak near the center and be near 0 at corners
    assert res[15, 15] > 6.0
    assert abs(res[0, 0]) < 1.0


def test_classify_gravity_zones() -> None:
    """Classification returns 5 exploration zones with correct codes and names."""
    h, w = 40, 40
    res = np.linspace(-5.0, 5.0, h * w, dtype="float32").reshape((h, w))
    grad = np.linspace(0.1, 4.0, h * w, dtype="float32").reshape((h, w))

    zones, names = classify_gravity_zones(res, grad)
    assert zones.shape == (h, w)
    assert zones.dtype == np.uint8
    assert set(np.unique(zones)).issubset({1, 2, 3, 4, 5})
    assert len(names) == 5
    assert 1 in names and 5 in names


def test_load_gravity_layers_when_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When no external gravity raster is found, returns clean degraded state."""
    monkeypatch.setattr(cfg, "EXTERNAL", tmp_path / "empty_ext")
    monkeypatch.setattr(cfg, "RAW", tmp_path / "empty_raw")
    monkeypatch.setattr(cfg, "ROOT", tmp_path / "empty_root")
    data = load_gravity_layers()
    assert data["active"] is False
    assert data["source_file"] is None
    assert data["raw_bouguer"] is None
    assert data["norm_bouguer"] is None
    assert data["regional_bouguer"] is None
    assert data["residual_bouguer"] is None
    assert data["norm_residual"] is None
    assert data["raw_gradient"] is None
    assert data["norm_gradient"] is None
    assert data["zones"] is None


def test_load_gravity_layers_when_present(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When a valid GeoTIFF is provided in EXTERNAL, warps and normalizes it."""
    ext_dir = tmp_path / "external"
    ext_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(cfg, "EXTERNAL", ext_dir)
    monkeypatch.setattr(cfg, "ROOT", tmp_path)

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
    # An unnamed file has not claimed to be a survey, so it cannot earn model weight.
    assert data["source_kind"] == KIND_UNVERIFIED
    assert data["scoreable"] is False
    assert data["raw_bouguer"] is not None
    assert data["norm_bouguer"] is not None
    assert data["residual_bouguer"] is not None
    assert data["regional_bouguer"] is not None
    assert data["norm_residual"] is not None
    assert data["norm_gradient"] is not None
    assert data["zones"] is not None
    assert data["norm_bouguer"].shape == (cfg.HEIGHT, cfg.WIDTH)
    assert np.nanmin(data["norm_bouguer"]) >= 0.0
    assert np.nanmax(data["norm_bouguer"]) <= 1.0


def _codes(zones: np.ndarray) -> set[int]:
    return {int(c) for c in np.unique(zones)}


def test_coverage_edge_does_not_invent_a_gradient() -> None:
    """The rim of a partial raster must not read as a steep density contact."""
    grid = np.full((60, 60), -100.0, dtype="float32")
    grid[:, :40] += np.linspace(0.0, 2.0, 40)  # a gentle real 2 mGal trend
    grid[:, 40:] = np.nan                     # outside the gravity coverage

    hgm = horizontal_gradient_magnitude(grid, cell_size_m=30.0)
    interior = float(np.nanmax(hgm[:, :38]))
    # The infill used to put a ~15.8 mGal/km cliff at the coverage boundary, an order
    # of magnitude above anything in the observed field.
    assert np.all(~np.isfinite(hgm[:, 39]))
    assert np.all(np.isfinite(hgm[:, 38]))
    assert float(np.nanmax(hgm[:, :39])) <= interior * 1.05

    _, residual = regional_residual_separation(grid, order=2)
    zones, _ = classify_gravity_zones(residual, hgm)
    assert 5 not in _codes(zones[:, 38:41])
    assert np.all(zones[:, 40:] == 0)


def test_flat_field_is_unclassified() -> None:
    """No contrast means no interpretation, not one enormous shear contact."""
    raw = np.full((50, 50), -100.0, dtype="float32")
    _, residual = regional_residual_separation(raw, order=2)
    gradient = horizontal_gradient_magnitude(raw)
    zones, _ = classify_gravity_zones(residual, gradient)
    assert np.all(zones == 0)


def test_uniform_gradient_is_a_tilt_not_a_contact() -> None:
    """A planar regional tilt has constant gradient and no contacts anywhere."""
    y, x = np.mgrid[0:60, 0:60]
    raw = (-100.0 + 0.02 * x + 0.01 * y).astype("float32")
    _, residual = regional_residual_separation(raw, order=2)
    gradient = horizontal_gradient_magnitude(raw)

    assert np.ptp(gradient[np.isfinite(gradient)]) < 1e-3
    zones, _ = classify_gravity_zones(residual, gradient)
    assert np.all(zones == 0)


def test_positive_residual_is_never_labelled_felsic() -> None:
    """Excess mass cannot be a granite/pegmatite low, however the percentiles fall."""
    residual = np.linspace(1.0, 9.0, 2500, dtype="float32").reshape(50, 50)
    gradient = np.zeros((50, 50), dtype="float32")
    zones, _ = classify_gravity_zones(residual, gradient)
    assert _codes(zones) == {1, 2}


def test_negative_residual_is_never_labelled_dense() -> None:
    """A mass deficit cannot be a mafic-ultramafic high-density core."""
    residual = np.linspace(-9.0, -1.0, 2500, dtype="float32").reshape(50, 50)
    gradient = np.zeros((50, 50), dtype="float32")
    zones, _ = classify_gravity_zones(residual, gradient)
    assert _codes(zones) == {3, 4}


def test_classify_gravity_zones_validates_grid() -> None:
    """Mismatched or non-2D inputs are refused rather than silently broadcast."""
    good = np.zeros((10, 10), dtype="float32")
    with pytest.raises(ValueError):
        classify_gravity_zones(good, np.zeros((10, 11), dtype="float32"))
    with pytest.raises(ValueError):
        classify_gravity_zones(good.ravel(), good)
    with pytest.raises(ValueError):
        regional_residual_separation(good.ravel())


def test_regional_residual_rejects_unknown_order() -> None:
    """order=3 used to fall through to the quadratic without saying so."""
    grid = np.zeros((10, 10), dtype="float32")
    with pytest.raises(ValueError):
        regional_residual_separation(grid, order=3)


def test_subsampled_fit_recovers_a_quadratic_surface() -> None:
    """The capped fit stays exact on a grid far larger than the sample budget."""
    h, w = 300, 300  # 90k cells, well past MAX_FIT_SAMPLES
    y, x = np.mgrid[0:h, 0:w]
    nx = 2.0 * x / (w - 1) - 1.0
    ny = 2.0 * y / (h - 1) - 1.0
    surface = (12.0 - 4.0 * nx + 7.0 * ny + 3.0 * nx**2 - 2.0 * nx * ny + 5.0 * ny**2)
    surface = surface.astype("float32")

    regional, residual = regional_residual_separation(surface, order=2)
    assert np.allclose(regional, surface, atol=1e-3)
    assert float(np.nanmax(np.abs(residual))) < 1e-3


def test_polynomial_fit_memory_is_bounded() -> None:
    """The full-grid design matrix cost 165 MiB inside a 512 MB container."""
    import tracemalloc

    grid = np.random.default_rng(0).normal(-100.0, 5.0, (900, 860)).astype("float32")
    tracemalloc.start()
    try:
        regional_residual_separation(grid, order=2)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak < 64 * 1024 * 1024, f"peak {peak / 1024 / 1024:.1f} MiB"


def test_gradient_defaults_to_the_active_grid_cell(monkeypatch: pytest.MonkeyPatch) -> None:
    """mGal/km must follow cfg.CELL, not a hardcoded 30 m."""
    monkeypatch.setattr(cfg, "CELL", 60.0)
    grid = np.tile(np.linspace(0.0, 10.0, 21, dtype="float32"), (20, 1))
    hgm = horizontal_gradient_magnitude(grid)
    assert np.allclose(hgm[:, 1:-1], 0.5 / 60.0 * 1000.0, atol=1e-3)


def _gravity_aoi(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, tags: dict[str, str] | None = None
) -> Path:
    """A one-raster AOI, isolated from whatever the repository has provisioned."""
    ext = tmp_path / "external"
    ext.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(cfg, "EXTERNAL", ext)
    monkeypatch.setattr(cfg, "RAW", tmp_path / "raw")
    monkeypatch.setattr(cfg, "ROOT", tmp_path)

    path = ext / "bouguer_gravity.tif"
    h = w = 12
    grid = np.linspace(-30.0, 40.0, h * w, dtype="float32").reshape((h, w))
    with rasterio.open(
        path, "w", driver="GTiff", height=h, width=w, count=1, dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(cfg.BBOX_WGS84[0], cfg.BBOX_WGS84[3], 0.01, 0.01),
    ) as dst:
        dst.write(grid, 1)
        if tags:
            dst.update_tags(**tags)
    return path


@pytest.mark.parametrize("declared,kind,scoreable,label_says", [
    (None, KIND_UNVERIFIED, False, "source unverified; excluded from scoring"),
    ("", KIND_UNVERIFIED, False, "source unverified; excluded from scoring"),
    ("survey", KIND_UNVERIFIED, False, "source unverified; excluded from scoring"),
    ("modelled", KIND_MODELLED, False, "modelled field, not a measurement; excluded from scoring"),
    ("measured", KIND_MEASURED, True, "measured survey, scored"),
    ("  MEASURED  ", KIND_MEASURED, True, "measured survey, scored"),
])
def test_the_gate_and_the_label_follow_the_declared_kind(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    declared: str | None, kind: str, scoreable: bool, label_says: str,
) -> None:
    """Only a raster that says it is a measurement may carry model weight.

    Silence is not a claim: an untagged or oddly tagged file reads as unverified, and
    the report says so in the same words the scoring gate used.
    """
    tags = {TAG_CITATION: "Test gravity compilation"}
    if declared is not None:
        tags[TAG_KIND] = declared
    path = _gravity_aoi(tmp_path, monkeypatch, tags)
    assert read_source_tags(path) == (kind, "Test gravity compilation")

    data = load_gravity_layers()
    assert data["active"] is True, "withholding weight must not also hide the map"
    assert data["source_kind"] == kind
    assert data["scoreable"] is scoreable
    assert data["norm_gradient"] is not None
    assert data["norm_residual"] is not None

    label = source_label(data)
    assert "Test gravity compilation" in label
    assert label_says in label


def test_an_uncited_raster_is_named_by_its_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _gravity_aoi(tmp_path, monkeypatch, {TAG_KIND: KIND_MODELLED})
    label = source_label(load_gravity_layers())
    assert "bouguer_gravity.tif" in label
    assert "excluded from scoring" in label


def test_no_raster_says_there_is_no_gravity(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cfg, "EXTERNAL", tmp_path / "none")
    monkeypatch.setattr(cfg, "RAW", tmp_path / "none")
    monkeypatch.setattr(cfg, "ROOT", tmp_path / "none")
    data = load_gravity_layers()
    assert data["scoreable"] is False
    assert source_label(data) == "No gravity raster — structural and spectral baseline only"


def test_the_bundled_field_does_not_claim_to_be_a_survey() -> None:
    """The shipped grid is analytic Gaussians from provision_gravity.py, not WGM2012.

    It must stay tagged as a model: hand-tagging it `measured` would put a fabricated
    field into a signed prospectivity number.
    """
    path = find_gravity_raster()
    if path is None:
        pytest.skip("no gravity raster provisioned in this checkout")
    kind, citation = read_source_tags(path)
    assert kind != KIND_MEASURED, f"{path.name} is a synthetic field tagged as a measurement"
    assert citation, "an unattributed gravity grid cannot be described honestly in a report"
    data = load_gravity_layers()
    assert data["scoreable"] is False
    assert "excluded from scoring" in source_label(data)
