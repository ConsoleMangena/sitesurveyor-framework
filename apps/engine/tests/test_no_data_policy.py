"""
No-data policy: an unobserved pixel must never be reported as scored evidence.

These tests pin the behaviour that a NaN in the continuous index used to inherit
from np.digitize — NaN sorts into the highest bin, so every data void was
published as "Very High" potential.
"""
from __future__ import annotations

import json

import numpy as np
import pytest

import src.config as cfg
from src.utils.classification import (
    CLASS_NAMES,
    NODATA_CLASS,
    NODATA_RGB,
    classify_zones,
    find_candidate_sites,
    finite_mean,
    jenks_breaks,
    paint_zones,
    safe_round,
    zone_class,
)
from src.utils.raster import robust_norm


@pytest.fixture()
def small_grid(monkeypatch):
    """Shrink the shared analysis grid so raster-wide helpers stay cheap."""
    monkeypatch.setattr(cfg, "HEIGHT", 60, raising=False)
    monkeypatch.setattr(cfg, "WIDTH", 60, raising=False)
    monkeypatch.setattr(cfg, "CELL", 30.0, raising=False)
    monkeypatch.setattr(cfg, "TARGET_ROW", 30, raising=False)
    monkeypatch.setattr(cfg, "TARGET_COL", 30, raising=False)
    return 60


def test_nan_cell_is_not_classified_as_very_high():
    index = np.array([[10.0, 50.0], [90.0, np.nan]], dtype="float32")
    breaks = np.array([20.0, 40.0, 60.0, 80.0], dtype="float32")

    zones = classify_zones(index, breaks)

    assert zones[1, 1] == NODATA_CLASS
    assert zones[0, 0] == 1
    assert zones[1, 0] == 5


def test_no_data_never_appears_in_the_scored_class_range():
    rng = np.random.default_rng(7)
    index = rng.uniform(0, 100, size=(80, 80)).astype("float32")
    index[:20, :20] = np.nan
    breaks = jenks_breaks(index[np.isfinite(index)], k=5)

    zones = classify_zones(index, breaks)
    scored = zones[zones != NODATA_CLASS]

    assert scored.min() >= 1
    assert scored.max() <= 5
    assert np.all(zones[:20, :20] == NODATA_CLASS)


def test_water_and_builtup_masks_still_override_scored_cells():
    index = np.full((6, 6), 55.0, dtype="float32")
    breaks = np.array([20.0, 40.0, 60.0, 80.0], dtype="float32")
    water = np.zeros((6, 6), dtype=bool)
    water[0, 0] = True
    builtup = np.zeros((6, 6), dtype=bool)
    builtup[5, 5] = True

    zones = classify_zones(index, breaks, water_mask=water, builtup_mask=builtup)

    assert zones[0, 0] == 0
    assert zones[5, 5] == 6


def test_zone_class_maps_unobserved_scores_to_no_data():
    breaks = np.array([20.0, 40.0, 60.0, 80.0], dtype="float32")

    assert zone_class(np.nan, breaks) == NODATA_CLASS
    assert zone_class(np.inf, breaks) == NODATA_CLASS
    assert zone_class(5.0, breaks) == 1
    assert zone_class(99.0, breaks) == 5


def test_class_names_covers_the_no_data_code():
    assert CLASS_NAMES[NODATA_CLASS] == "No data"
    assert CLASS_NAMES[5] == "Very high"


def test_finite_mean_ignores_voids_and_reports_none_when_all_void():
    window = np.array([10.0, np.nan, 30.0], dtype="float32")
    assert finite_mean(window) == pytest.approx(20.0)
    assert not np.isfinite(finite_mean(np.full((3, 3), np.nan)))


def test_safe_round_keeps_json_valid_over_missing_cells():
    payload = {"score": safe_round(np.nan, 1), "ok": safe_round(12.3456, 2)}

    assert payload["score"] is None
    assert payload["ok"] == 12.35
    # json.dumps would happily emit a bare NaN that strict parsers reject
    assert json.loads(json.dumps(payload)) == payload


def test_robust_norm_of_an_unobserved_layer_is_not_zero():
    a = np.full((10, 10), np.nan, dtype="float32")
    out = robust_norm(a)

    assert np.all(np.isnan(out))


def test_jenks_survives_no_valid_values_and_is_deterministic():
    breaks = jenks_breaks(np.array([np.nan, np.nan], dtype="float32"), k=5)
    assert breaks.shape == (4,)
    assert np.all(np.isfinite(breaks))

    values = np.random.default_rng(3).uniform(0, 100, size=5000)
    first = jenks_breaks(values, k=5)
    second = jenks_breaks(values, k=5)
    assert np.array_equal(first, second)


def test_candidate_picking_skips_no_data_cells(small_grid):
    index = np.full((small_grid, small_grid), 90.0, dtype="float32")
    breaks = np.array([20.0, 40.0, 60.0, 80.0], dtype="float32")
    zones = classify_zones(index, breaks)

    # A high-scoring block with no coverage must not become a candidate site.
    zones[10:14, 10:14] = NODATA_CLASS
    index[10:14, 10:14] = np.nan

    candidates = find_candidate_sites(
        index, zones, min_class=4, min_distance_m=300.0, top_k=5,
        target_row=30, target_col=30, border_margin_px=5,
    )

    assert all(not (10 <= c["row"] < 14 and 10 <= c["col"] < 14) for c in candidates)

    # Even a stale zone raster that labels the void "Very High" is rejected,
    # because the index itself is not finite there.
    zones[10:14, 10:14] = 5
    stale = find_candidate_sites(
        index, zones, min_class=4, min_distance_m=300.0, top_k=5,
        target_row=30, target_col=30, border_margin_px=5,
    )
    assert all(not (10 <= c["row"] < 14 and 10 <= c["col"] < 14) for c in stale)


def test_paint_zones_keeps_voids_out_of_the_ranked_palette():
    from matplotlib.colors import ListedColormap

    very_high = ListedColormap(
        ["#ffffff", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850", "#7f7f7f"]
    )
    classes = np.array([[5, NODATA_CLASS, 0]], dtype="uint8")

    rgb = paint_zones(classes, very_high)

    assert rgb[0, 0] == pytest.approx((26 / 255, 152 / 255, 80 / 255))
    assert rgb[0, 1] == pytest.approx(NODATA_RGB)
    assert rgb[0, 2] == pytest.approx((1.0, 1.0, 1.0))


def test_paint_zones_shades_unobserved_terrain_neutrally():
    from matplotlib.colors import ListedColormap

    cmap = ListedColormap(["#000000", "#000000", "#000000", "#000000", "#000000", "#ffffff", "#000000"])
    classes = np.full((2, 2), 5, dtype="uint8")
    hillshade = np.array([[1.0, np.nan], [np.nan, np.nan]], dtype="float32")

    rgb = paint_zones(classes, cmap, hillshade)

    assert rgb[0, 0, 0] > rgb[0, 1, 0], "NaN hillshade should not brighten the tile"
    assert np.isfinite(rgb).all()
