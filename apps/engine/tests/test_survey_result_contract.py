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
from contextlib import ExitStack
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


@pytest.mark.parametrize("categories", [["water"], ["all"]], ids=["water-only", "all-categories"])
def test_survey_assembles_current_results_with_no_borehole_candidate(
    _isolated_out: Path, categories: list[str],
) -> None:
    """Keep dossier assembly real: absent disk outputs must not lose engine results."""
    from src.mcp import server

    summaries = {
        "water": {
            "target_coordinates": {"latitude": -19.5, "longitude": 29.8},
            "target_assessment": {"coordinate_cell_score": 31.0, "coordinate_cell_class": "Low"},
            "candidate_sites": [],
        },
        "minerals": {
            "target_coordinates": {"latitude": -19.5, "longitude": 29.8},
            "target_assessment": {"coordinate_cell_score": 72.0},
            "candidate_targets": [],
        },
        "soil": {"target_lat": -19.5, "target_lon": 29.8, "target_sci_score": 55.0},
        "hazard": {
            "target_coordinates": {"latitude": -19.5, "longitude": 29.8},
            "target_assessment": {"hazard_index_score": 20.0, "safety_index_score": 80.0},
        },
    }
    fixed_layers = {"water": "rainfall", "minerals": "alos", "soil": "crop_mask", "hazard": "wofs"}
    for key, summary in summaries.items():
        summary["provenance"] = {
            "category": key,
            "target": cfg.target_block(-19.5, 29.8, 0.12),
            "data_sources": {
                "selectable": {}, "fixed": {fixed_layers[key]: f"{key}-source"},
            },
        }
    # A skipped mineral category must not come back through the shared output directory.
    (_isolated_out / "mineral_summary.json").write_text(json.dumps({
        "target_coordinates": {"latitude": -20.0, "longitude": 30.0},
        "target_assessment": {"coordinate_cell_score": 99.0},
    }), encoding="utf-8")

    with ExitStack() as stack:
        # Restore all geometry globals after running the real site setter; keep its
        # cache directory and the real dossier JSON inside the temporary directory.
        stack.enter_context(patch.dict(vars(cfg), {"RAW_BASE": _isolated_out}))
        stack.enter_context(patch.object(server, "_ensure_data_present"))
        engines = {
            key: stack.enter_context(patch(
                f"src.engines.{key}.run_{key}_survey", return_value=summary,
            ))
            for key, summary in summaries.items()
        }
        result = server.survey_site(
            latitude=-19.5, longitude=29.8, categories=categories,
            client_name="Test", address="", half_deg=0.12,
        )

    selected = list(summaries) if categories == ["all"] else categories
    for key, engine in engines.items():
        if key in selected:
            engine.assert_called_once_with()
        else:
            engine.assert_not_called()
    dossier_keys = {"water": "water", "minerals": "minerals", "soil": "soil_land", "hazard": "hazard_safety"}
    expected_categories = {dossier_keys[key]: summaries[key] for key in selected}
    assert result["status"] == "success"
    assert result["categories"] == expected_categories
    assert result["provenance"] == {
        key: summary["provenance"] for key, summary in expected_categories.items()
    }
    assert result["data_sources"] == {
        "selectable": {},
        "fixed": {fixed_layers[key]: f"{key}-source" for key in selected},
    }
    assert result["score_basis"] == "aoi_relative_weighted_index"
    assert result["scores"]["groundwater"]["cell_score"] == 31.0
    assert result["primary_recommendations"]["top_borehole_drilling_site"] is None
    assert result["candidates"]["water"] == []
    assert "top borehole site N/A km away" in result["executive_summary"]
    stored = json.loads((_isolated_out / "master_site_dossier.json").read_text(encoding="utf-8"))
    assert stored["categories"] == expected_categories
    assert stored["executive_scorecard"]["groundwater"]["primary_borehole_candidate"] is None
    assert result["provenance"] == stored["provenance"]
    assert result["data_sources"] == stored["data_sources"]
    json.dumps(result, allow_nan=False)


def test_worker_preserves_recorded_sources_and_serializes_configuration(_isolated_out: Path) -> None:
    import worker
    from src.mcp.server import _SITE_LOCK

    recorded = {"selectable": {}, "fixed": {"rainfall": "recorded-rain-source"}}
    result = {"data_sources": recorded}
    payload = {
        "latitude": -19.5, "longitude": 29.8, "half_deg": 0.08,
        "client_name": "Synthetic", "address": "", "categories": ["soil"],
        "data_sources": {}, "composite": {},
    }

    def check_configuration_lock(*args, **kwargs):
        from concurrent.futures import ThreadPoolExecutor

        def attempt_lock():
            acquired = _SITE_LOCK.acquire(blocking=False)
            if acquired:
                _SITE_LOCK.release()
            return acquired

        with ThreadPoolExecutor(max_workers=1) as pool:
            assert not pool.submit(attempt_lock).result()

    with patch.object(cfg, "set_target_site", side_effect=check_configuration_lock), \
         patch.object(cfg, "set_data_sources", return_value={}), \
         patch.object(cfg, "set_composite"), \
         patch.object(worker, "survey_site", return_value=result):
        actual = worker.execute(payload)
    assert actual["data_sources"] is recorded
    assert actual["target"] == cfg.target_block(-19.5, 29.8, 0.08)


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