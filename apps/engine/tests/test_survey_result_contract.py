"""What a published survey result must carry, and what it must not inherit.

The workbench reads the commodity screen from `result.categories.minerals` and the
depth-to-water from `result.categories.water`. Both live in the dossier, so a result
built only from the scorecard renders a score and no minerals -- the panel returns null
on an empty list rather than reporting that it is missing.

The second half guards the shared output directory: `survey_files()` publishes by
existence alone, so a run that does not clear it hands the workspace the previous
run's maps under its own id.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

import src.config as cfg

MINERALS_DOSSIER = {
    "executive_scorecard": {
        "minerals": {"cell_score": 71.0, "cell_class": "High"},
    },
    "categories": {
        "minerals": {
            "target_coordinates": {"latitude": -19.5, "longitude": 29.8},
            "mineral_commodities": [
                {
                    "key": "gold", "name": "Gold", "group": "Orogenic",
                    "indicated": True, "confidence": "High",
                    "area_top_decile": 82.0, "area_band": "High", "target_score": 71.0,
                },
            ],
            "unscreenable_commodities": [
                {"name": "Diamonds (kimberlite)", "reason": "below pixel", "needs": "magnetics"},
            ],
            "candidate_targets": [
                {"latitude": -19.5, "longitude": 29.8, "potential_score": 71.0},
            ],
        },
    },
}


def _run_survey(dossier: dict, categories: list[str]) -> dict:
    from src.mcp import server

    with patch.object(server, "_ensure_data_present"), \
         patch.object(server.cfg, "set_target_site"), \
         patch("src.engines.minerals.run_minerals_survey", return_value={}), \
         patch("src.engines.water.run_water_survey", return_value={}), \
         patch("src.report.generate_site_dossier", return_value=dossier):
        return server.survey_site(
            latitude=-19.5, longitude=29.8, categories=categories,
            client_name="Test", address="", half_deg=0.12,
        )


def test_result_carries_the_commodity_screen_the_workbench_reads() -> None:
    result = _run_survey(MINERALS_DOSSIER, ["minerals"])

    minerals = result["categories"]["minerals"]
    assert minerals["mineral_commodities"][0]["key"] == "gold"
    assert minerals["mineral_commodities"][0]["indicated"] is True
    assert minerals["unscreenable_commodities"][0]["name"] == "Diamonds (kimberlite)"


def test_result_carries_the_water_assessment_depth_is_read_from() -> None:
    dossier = {
        "executive_scorecard": {},
        "categories": {
            "water": {
                "target_assessment": {
                    "depth_to_water_wet_m": 12.0,
                    "depth_to_water_dry_m": 28.0,
                    "borehole_read": "Hand pump viable",
                },
            },
        },
    }
    result = _run_survey(dossier, ["water"])

    assessment = result["categories"]["water"]["target_assessment"]
    assert assessment["depth_to_water_wet_m"] == 12.0
    assert assessment["borehole_read"] == "Hand pump viable"


def test_categories_are_json_serializable_for_the_jsonb_column() -> None:
    result = _run_survey(MINERALS_DOSSIER, ["minerals"])
    # The worker posts this dict as a jsonb parameter; a numpy scalar or a NaN would
    # fail the whole publish rather than one field.
    json.dumps(result, allow_nan=False)


def test_a_dossier_without_categories_costs_an_empty_block_not_a_key_error() -> None:
    result = _run_survey({"executive_scorecard": {}}, ["minerals"])
    assert result["categories"] == {}


@pytest.fixture
def _isolated_out(tmp_path: Path):
    saved = cfg.OUT
    cfg.OUT = tmp_path
    yield tmp_path
    cfg.OUT = saved


def test_reset_outputs_removes_the_previous_runs_deliverables(_isolated_out: Path) -> None:
    import worker

    stale = _isolated_out / "groundwater_potential_map.png"
    stale.write_bytes(b"previous site")
    (_isolated_out / "summary.json").write_text('{"client": "someone else"}')

    worker.reset_outputs()

    assert not stale.exists()
    assert worker.survey_files() == [], "a cleared run still offers the last run's files"


def test_reset_outputs_keeps_the_coverage_cache(_isolated_out: Path, tmp_path_factory) -> None:
    import worker

    raw = tmp_path_factory.mktemp("raw")
    coverage = raw / "dem.tif"
    coverage.write_bytes(b"cached coverage")
    saved_raw = cfg.RAW
    cfg.RAW = raw
    try:
        worker.reset_outputs()
        assert coverage.exists(), "clearing outputs must not force a re-download"
    finally:
        cfg.RAW = saved_raw


def test_reset_outputs_survives_a_missing_directory(_isolated_out: Path) -> None:
    import worker

    cfg.OUT = _isolated_out / "never-created"
    worker.reset_outputs()


def test_only_the_files_this_run_wrote_are_published(_isolated_out: Path) -> None:
    import worker

    (_isolated_out / "mineral_prospectivity_map.png").write_bytes(b"this run")

    kinds = [kind for kind, _, _ in worker.survey_files()]
    assert kinds == ["minerals_map"]