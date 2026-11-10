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


def test_the_map_raster_classes_every_cell_by_the_winning_system(mineral_run) -> None:
    from src.utils import commodities as cm
    from src.utils.classification import ZONE_PALETTES

    _, out = mineral_run
    with rasterio.open(out / "mineral_commodity_zones.tif") as src:
        zones = src.read(1)
        colours = src.colormap(1)
    with rasterio.open(out / "mineral_commodity_index.tif") as src:
        index = src.read(1).astype("float64")

    allowed = {cm.ZONE_WATER, cm.ZONE_BELOW_THRESHOLD, cm.ZONE_BUILTUP, cm.ZONE_NODATA}
    allowed |= set(cm.COMMODITY_ZONE_CODES.values())
    assert set(np.unique(zones).tolist()) <= allowed, "the raster holds a code no legend can name"

    threshold = cm.INDICATED_P90
    for key, code in cm.COMMODITY_ZONE_CODES.items():
        owned = zones == code
        assert np.all(index[owned] >= threshold - 0.05), (
            f"{key} is painted on ground whose best score is below the indicated threshold"
        )
    cold = zones == cm.ZONE_BELOW_THRESHOLD
    assert np.all(index[cold] < threshold + 0.05), "cold ground took a mineral's colour"
    for code in (cm.ZONE_WATER, cm.ZONE_BUILTUP, cm.ZONE_NODATA):
        assert not np.any(np.isfinite(index[zones == code])), (
            "excluded or unobserved ground was given a score"
        )

    # The file's own colour table is what desktop GIS and the browser drape paint from,
    # so it has to be the palette the web legend mirrors, code for code.
    for code, hex_colour in enumerate(ZONE_PALETTES["minerals"]):
        clean = hex_colour.lstrip("#")
        expected = tuple(int(clean[i:i + 2], 16) for i in (0, 2, 4))
        assert tuple(colours[code][:3]) == expected, f"code {code} is painted a different colour in the file"

    # A GeoTIFF colour table is RGB-only, so the drape's transparency lives in the PNG
    # fallback and the tile lookup instead. Cold ground must not hide the imagery.
    from PIL import Image

    with Image.open(out / "minerals_overlay.png") as overlay:
        alpha = np.asarray(overlay.convert("RGBA"))[..., 3]
    assert np.all(alpha[zones == cm.ZONE_BELOW_THRESHOLD] == 0), "cold ground washes out the basemap"
    assert np.all(alpha[zones == cm.ZONE_NODATA] == 0)
    painted = alpha[zones == cm.COMMODITY_ZONE_CODES["gold"]]
    assert painted.size == 0 or np.all(painted > 0), "a mineral zone draped transparent"


def test_a_candidate_carries_the_mineral_the_map_shows_for_that_cell(mineral_run) -> None:
    from rasterio.warp import transform as transform_coords

    from src.utils import commodities as cm

    summary, out = mineral_run
    candidates = summary["candidate_targets"]
    assert candidates, "the synthetic AOI produced no targets to check"
    with rasterio.open(out / "mineral_commodity_index.tif") as src:
        index = src.read(1).astype("float64")
        crs = src.crs
        index_of = src.index
    with rasterio.open(out / "mineral_commodity_zones.tif") as zsrc:
        zones = zsrc.read(1)

    for candidate in candidates:
        xs, ys = transform_coords("EPSG:4326", crs,
                                  [candidate["longitude"]], [candidate["latitude"]])
        row, col = index_of(xs[0], ys[0])
        cell = float(index[row, col])
        code = int(zones[row, col])
        assert np.isfinite(cell), "a field target landed on unscored ground"
        assert candidate["primary_commodity_score"] == pytest.approx(round(cell, 1), abs=0.15), (
            "the candidate's headline score is not the number the map raster holds there"
        )
        scores = [candidate[f"{c['key']}_score"] for c in summary["mineral_commodities"]]
        assert cell == pytest.approx(max(v for v in scores if v is not None), abs=0.15), (
            "the map raced the systems differently from the candidate row"
        )
        if code == cm.ZONE_BELOW_THRESHOLD:
            assert cell < cm.INDICATED_P90
        else:
            assert candidate["primary_commodity_key"] == cm.BY_ZONE_CODE[code].key


def test_the_legend_figures_cover_the_whole_survey_area(mineral_run) -> None:
    from src.utils import commodities as cm

    summary, out = mineral_run
    rows = summary["commodity_area_distribution"]
    assert {row["key"] for row in rows} == set(cm.COMMODITY_ZONE_CODES), (
        "a screened system is missing from the map's figures"
    )
    with rasterio.open(out / "mineral_commodity_zones.tif") as src:
        zones = src.read(1)
    cell_km2 = (cfg.CELL * cfg.CELL) / 1e6
    for row in rows:
        assert row["cells"] == int(np.count_nonzero(zones == row["code"]))
        assert row["area_km2"] == pytest.approx(row["cells"] * cell_km2, abs=0.011)
    # Every cell is accounted for exactly once: mineral, cold, water, built-up or void.
    assert sum(row["cells"] for row in rows) + sum(
        int(np.count_nonzero(zones == code))
        for code in (cm.ZONE_WATER, cm.ZONE_BELOW_THRESHOLD, cm.ZONE_BUILTUP, cm.ZONE_NODATA)
    ) == zones.size


def test_the_summary_publishes_as_strict_json(mineral_run) -> None:
    summary, _ = mineral_run
    # The worker posts this as a jsonb parameter; a bare NaN fails the whole publish.
    json.dumps(summary, allow_nan=False)
    assert summary["mineral_commodities"]
    assert summary["unscreenable_commodities"]


def test_gravity_declares_itself_and_only_scores_when_it_is_a_measurement(mineral_run) -> None:
    """A modelled field must reach the page labelled, and must not drive a score.

    The dashboard reads `data_sources` and nothing else from the provenance tree, so the
    declaration has to travel there or the number on screen has no stated basis.
    """
    from src.utils import commodities as cm

    summary, _ = mineral_run
    grav = summary["provenance"]["gravimetry"]
    assert grav["scored"] == (grav["kind"] == "measured")
    label = summary["provenance"]["data_sources"]["fixed"]["gravimetry"]
    assert label and label == grav["label"]

    if not grav["active"]:
        assert "No gravity raster" in label
        return

    assert grav["citation"], "an unattributed gravity grid cannot be described honestly"
    for candidate in summary["candidate_targets"]:
        assert candidate.get("gravity_source_kind") == grav["kind"]
        if not grav["scored"]:
            for note in candidate["field_notes"]:
                if "mGal" in note:
                    assert f"({grav['kind']} field)" in note, note

    if not grav["scored"]:
        assert "excluded from scoring" in label
        for commodity in summary["mineral_commodities"]:
            driven = {item["evidence"] for item in commodity["top_evidence"]}
            assert not driven & set(cm.GRAVITY_EVIDENCE), (
                f"{commodity['key']} credits gravity it was never given"
            )

    from src.category_report import build_report_html, get

    html = build_report_html(get("minerals"), summary)
    assert ("measured survey, scored" if grav["scored"] else "excluded from scoring") in html, (
        "the printed report does not say what the gravity field was worth"
    )


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