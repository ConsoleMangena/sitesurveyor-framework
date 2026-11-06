"""Regression tests for spectral index behaviour and output provenance.

A screening product is only as trustworthy as its claims about itself: an index that
silently substitutes 0 for unmeasured ground, a residual that changes between runs, or
a summary that says a layer was "integrated" because a file happened to exist all make
a wrong answer look authoritative.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pytest

from src.report import _img_to_base64_src, _load_category
from src.utils.spectral import (
    bare_soil_index, gossan_index, hydroxyl_index, ndvi, ndwi, residual_index,
)

VOID = np.zeros((6, 6), dtype="float32")


# ---------------------------------------------------------------------------
# Spectral ratios: unmeasured ground must not become a value
# ---------------------------------------------------------------------------

VOID_ARGS = {
    "ndvi": (VOID, VOID),
    "ndwi": (VOID, VOID),
    "hydroxyl_index": (VOID, VOID),
    "bare_soil_index": (VOID, VOID, VOID, VOID),
}


@pytest.mark.parametrize("fn", [ndvi, ndwi, hydroxyl_index, bare_soil_index])
def test_zero_reflectance_yields_nan_not_zero_or_inf(fn):
    out = fn(*VOID_ARGS[fn.__name__])
    assert np.isnan(out).all(), f"{fn.__name__} turned a void scene into a number"
    assert not np.isinf(out).any()


def test_void_pixels_do_not_spew_runtime_warnings():
    """np.where evaluates both branches, so 0/0 warns even though the result is masked.

    A fully void scene used to bury the server log in 'invalid value encountered in
    divide', which is how a real warning gets lost.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        ndvi(VOID, VOID)
        hydroxyl_index(VOID, VOID)
        gossan_index(VOID, VOID, VOID)
        bare_soil_index(VOID, VOID, VOID, VOID)


def test_indices_stay_within_physical_bounds():
    """A band that was never converted to reflectance (signed, near-zero) drives the
    ratio far past 1; the clip is what stops that from being read as 'dense vegetation'."""
    nir = np.array([[0.30, 0.50]], dtype="float32")
    red = np.array([[0.28, -0.49]], dtype="float32")
    out = ndvi(nir, red)
    assert out[0, 0] == pytest.approx(0.034, abs=1e-3)
    assert out[0, 1] == 1.0, "unclipped NDVI escaped its physical range"
    assert np.all(out <= 1.0) and np.all(out >= -1.0)


# ---------------------------------------------------------------------------
# Vegetation detrending: same site, same answer, every run
# ---------------------------------------------------------------------------

def _big_pair(n=120_000, seed=0):
    rng = np.random.default_rng(seed)
    nd = rng.uniform(0, 1, n).astype("float32")
    ix = (0.4 * nd + 0.1 * nd ** 2 + rng.normal(0, 0.02, n)).astype("float32")
    return ix, nd


def test_residual_index_is_deterministic_above_the_sampling_threshold():
    ix, nd = _big_pair()
    a = residual_index(ix, nd)
    b = residual_index(ix, nd)
    assert np.array_equal(a, b), "residual subsampling was drawing a fresh random sample per run"


def test_residual_index_removes_most_of_the_vegetation_signal():
    ix, nd = _big_pair()
    resid = residual_index(ix, nd)
    assert np.nanstd(resid) < 0.25 * np.nanstd(ix)


def test_too_few_jointly_observed_pixels_reports_no_data(capsys):
    """Returning the raw index here would label an undetrended ratio as a residual."""
    sparse = np.full(400, np.nan, dtype="float32")
    sparse[:20] = 0.3
    nd = np.full(400, np.nan, dtype="float32")
    nd[:20] = 0.5
    out = residual_index(sparse, nd)
    assert np.isnan(out).all()
    assert "no vegetation detrend fitted" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# Dossier provenance: "not run" and "unreadable" are different problems
# ---------------------------------------------------------------------------

def test_load_category_distinguishes_missing_from_corrupt(tmp_path):
    absent = tmp_path / "summary.json"
    data, status = _load_category(absent)
    assert data is None and status == "not_run"

    corrupt = tmp_path / "mineral_summary.json"
    corrupt.write_text("{ this is not json", encoding="utf-8")
    data, status = _load_category(corrupt)
    assert data is None
    assert status.startswith("unreadable"), status
    assert "JSONDecodeError" in status

    wrong = tmp_path / "soil_summary.json"
    wrong.write_text("[1, 2, 3]", encoding="utf-8")
    data, status = _load_category(wrong)
    assert data is None and status.startswith("unexpected structure")

    good = tmp_path / "hazard_summary.json"
    good.write_text(json.dumps({"target_assessment": {}}), encoding="utf-8")
    data, status = _load_category(good)
    assert status == "loaded" and data["target_assessment"] == {}


def test_map_embedding_states_why_a_panel_is_blank(tmp_path):
    src, note = _img_to_base64_src(tmp_path / "groundwater_potential_map.png")
    assert src is None and note == "map file not produced"

    empty = tmp_path / "soil_capability_map.png"
    empty.write_bytes(b"")
    src, note = _img_to_base64_src(empty)
    assert src is None and note == "map file is empty"

    real = tmp_path / "hazard_risk_map.png"
    real.write_bytes(b"\x89PNG\r\n\x1a\n fake but readable")
    src, note = _img_to_base64_src(real)
    assert note == "embedded" and src.startswith("data:image/png;base64,")


# ---------------------------------------------------------------------------
# MCP cached-survey reuse: a skipped cache must be explained
# ---------------------------------------------------------------------------

def test_cached_summary_matches_only_the_requested_point(tmp_path):
    from src.mcp.server import _cached_summary

    path = tmp_path / "summary.json"
    path.write_text(json.dumps({"target_coordinates": {"latitude": -19.0, "longitude": 29.9}}),
                    encoding="utf-8")

    hit = _cached_summary(path, -19.0001, 29.9001)
    assert hit is not None and hit["target_coordinates"]["latitude"] == -19.0

    assert _cached_summary(path, -20.5, 30.5) is None
    assert _cached_summary(tmp_path / "absent.json", -19.0, 29.9) is None


def test_cached_summary_reads_flat_coordinate_keys(tmp_path):
    """soil_summary.json stores target_lat/target_lon instead of a nested object."""
    from src.mcp.server import _cached_summary

    path = tmp_path / "soil_summary.json"
    path.write_text(json.dumps({"target_lat": -19.0, "target_lon": 29.9}), encoding="utf-8")
    assert _cached_summary(path, -19.0002, 29.9) is not None


def test_cached_summary_reports_corruption_instead_of_silently_rerunning(tmp_path, capsys):
    from src.mcp.server import _cached_summary

    path = tmp_path / "hazard_summary.json"
    path.write_text("{}", encoding="utf-8")
    assert _cached_summary(path, -19.0, 29.9) is None
    assert "no target coordinates" in capsys.readouterr().out

    path.write_text("{ broken", encoding="utf-8")
    assert _cached_summary(path, -19.0, 29.9) is None
    assert "unreadable" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# The dossier must survive a survey that found nothing
# ---------------------------------------------------------------------------

def test_dossier_builds_when_a_category_ran_but_found_no_candidates(tmp_path, monkeypatch):
    """An all-void scene legitimately returns zero candidates; the scorecard must record
    that as a null primary rather than crashing while compiling the JSON dossier."""
    import src.config as cfg
    monkeypatch.setattr(cfg, "OUT", tmp_path)

    (tmp_path / "soil_summary.json").write_text(
        json.dumps({"target_lat": -19.5, "target_lon": 29.8,
                    "target_sci_score": 71.0, "target_sci_class": "High",
                    "candidate_areas": []}), encoding="utf-8")
    (tmp_path / "hazard_summary.json").write_text(
        json.dumps({"target_coordinates": {"latitude": -19.5, "longitude": 29.8},
                    "target_assessment": {"safety_index_score": 80.0},
                    "safest_candidate_sites": []}), encoding="utf-8")

    from src.report import generate_site_dossier
    dossier = generate_site_dossier()

    assert dossier["category_status"]["soil_land"] == "loaded"
    assert dossier["executive_scorecard"]["soil_land"]["primary_agricultural_zone"] is None
    assert (tmp_path / "master_site_dossier.json").exists()
