"""The mineral map, the commodity table and the candidate rows must be one model.

Gold used to reach the commodity screen as `robust_norm(weighted_overlay) * 100` while
the other eight systems arrived as the weighted overlay itself. The extra rescale
stretched gold to fill 0-100, so on identical evidence it read ~20 points high, ranked
first, and cleared the `indicated` threshold on ground that supports iron ore or nothing.

These run the real engine over synthetic coverages: the bias lived in the wiring between
the overlay and the screen, which no numpy-only test of the scoring rules could see.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

import src.config as cfg

rasterio = pytest.importorskip("rasterio")


@pytest.fixture(scope="module")
def mineral_run(tmp_path_factory):
    """One minerals-only survey over a small synthetic AOI, with its outputs."""
    from scipy.ndimage import gaussian_filter

    state = tmp_path_factory.mktemp("mineral-state")
    saved = {name: getattr(cfg, name) for name in
             ("OUT", "RAW", "RAW_BASE", "AOI_SLUG", "TARGET_LAT", "TARGET_LON", "HALF_DEG",
              "WIDTH", "HEIGHT", "TRANSFORM", "LOCAL_CRS", "EPSG", "UTM_ZONE",
              "BBOX_WGS84", "TARGET_ROW", "TARGET_COL", "CLIENT", "CLIENT_ADDRESS",
              "XMIN", "XMAX", "YMIN", "YMAX", "TO_LOCAL", "TO_WGS", "TO_6933",
              "TARGET_X", "TARGET_Y")}
    cfg.OUT = state / "outputs"
    cfg.OUT.mkdir(parents=True, exist_ok=True)
    # Keep the synthetic coverages out of the repository's real per-AOI cache.
    cfg.RAW_BASE = state / "raw"
    cfg.set_target_site(-19.5, 29.8, half_deg=0.04, client="Synthetic", address="test")

    rng = np.random.default_rng(11)
    height, width = cfg.HEIGHT, cfg.WIDTH

    def field(smooth):
        return gaussian_filter(rng.normal(size=(height, width)), smooth)

    def write(name, arrays, dtype, descriptions=None, nodata=None):
        with rasterio.open(
            cfg.RAW / name, "w", driver="GTiff", height=height, width=width,
            count=len(arrays), dtype=dtype, crs=cfg.LOCAL_CRS, transform=cfg.TRANSFORM,
            nodata=nodata,
        ) as dst:
            for i, arr in enumerate(arrays, start=1):
                dst.write(arr.astype(dtype), i)
                if descriptions:
                    dst.set_band_description(i, descriptions[i - 1])

    write("dem.tif", [1200 + 120 * field(12)], "float32")

    landcover = np.full((height, width), 30, dtype="uint8")
    landcover[: int(height * 0.08), :] = 80
    landcover[-int(height * 0.08):, :] = 50
    write("landcover.tif", [landcover], "uint8")

    alos = np.abs(field(6)) * 100
    write("alos.tif", [alos, alos * 0.6 + np.abs(field(3)) * 40], "float32")

    blue = np.clip(0.08 + 0.02 * field(5), 0, 1)
    red = np.clip(blue + 0.18 + 0.06 * np.abs(field(4)), 0, 1)
    nir = np.clip(red + 0.25 * np.clip(0.2 + 0.25 * field(10), 0, 1) + 0.1, 0, 1)
    swir1 = np.clip(0.25 + 0.08 * field(6), 0, 1)
    swir2 = np.clip(0.18 + 0.06 * field(7), 0, 1)
    write("optical.tif",
          [b * 10000 for b in (blue, red, nir, swir1, swir2)], "uint16",
          descriptions=["blue", "red", "nir", "swir_1", "swir_2"], nodata=0)

    from src.engines.minerals import run_minerals_survey

    with patch("src.fetch_data.ensure_raw"):
        summary = run_minerals_survey()

    yield summary, cfg.OUT
    for name, value in saved.items():
        setattr(cfg, name, value)


def test_gold_is_scored_by_the_same_rule_as_every_other_system(mineral_run) -> None:
    from src.utils import commodities as cm

    summary, _ = mineral_run
    gold = next(c for c in summary["mineral_commodities"] if c["key"] == "gold")
    # A rescaled gold index reads ~20 points above the rest on the same evidence. The
    # tell is gold sitting far above the field rather than inside it.
    others = [c["area_top_decile"] for c in summary["mineral_commodities"] if c["key"] != "gold"]
    assert gold["area_top_decile"] <= max(others) + 5.0, (
        f"gold reads {gold['area_top_decile']} against a field topping out at {max(others)}: "
        "the overlay is being rescaled before the screen sees it"
    )
    assert cm.GOLD.weights == cfg.MINERAL_WEIGHTS


def test_the_map_raster_and_the_table_agree_about_gold(mineral_run) -> None:
    summary, out = mineral_run
    gold = next(c for c in summary["mineral_commodities"] if c["key"] == "gold")
    with rasterio.open(out / "mineral_prospectivity_index.tif") as src:
        index = src.read(1).astype("float64")

    # The table masks open water and built-up ground; the raster keeps them as no-data.
    landcover = out / "mineral_prospectivity_zones.tif"
    with rasterio.open(landcover) as src:
        zones = src.read(1)
    scored = index[np.isfinite(index) & (zones != 0) & (zones != 6)]
    assert scored.size, "the index raster has no scored ground"
    assert np.percentile(scored, 90) == pytest.approx(gold["area_top_decile"], abs=0.15)


def test_a_candidate_carries_the_index_the_map_shows_for_that_cell(mineral_run) -> None:
    from rasterio.warp import transform as transform_coords

    summary, out = mineral_run
    candidates = summary["candidate_targets"]
    assert candidates, "the synthetic AOI produced no targets to check"
    with rasterio.open(out / "mineral_prospectivity_index.tif") as src:
        index = src.read(1).astype("float64")
        for candidate in candidates:
            xs, ys = transform_coords(
                "EPSG:4326", src.crs,
                [candidate["longitude"]], [candidate["latitude"]],
            )
            row, col = src.index(xs[0], ys[0])
            cell = index[row, col]
            if not np.isfinite(cell):
                continue
            assert candidate["gold_score"] == pytest.approx(round(float(cell), 1), abs=0.15), (
                "the candidate's gold score is not the number the map raster holds there"
            )


def test_the_summary_publishes_as_strict_json(mineral_run) -> None:
    summary, _ = mineral_run
    # The worker posts this as a jsonb parameter; a bare NaN fails the whole publish.
    json.dumps(summary, allow_nan=False)
    assert summary["mineral_commodities"]
    assert summary["unscreenable_commodities"]


def test_every_candidate_names_a_commodity_it_actually_scored(mineral_run) -> None:
    summary, _ = mineral_run
    for candidate in summary["candidate_targets"]:
        primary = candidate["primary_commodity"]
        assert primary, "a target with no primary affinity reads as an unexplained dot"
        scores = {
            c["name"]: candidate.get(f"{c['key']}_score")
            for c in summary["mineral_commodities"]
        }
        assert scores[primary] == candidate["primary_commodity_score"]
        assert candidate["primary_commodity_score"] == max(
            v for v in scores.values() if v is not None
        )