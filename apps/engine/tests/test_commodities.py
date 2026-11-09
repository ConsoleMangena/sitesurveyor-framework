"""
Tests for the mineral commodity screen.

These are deliberately numpy-only: the catalogue and the scoring arithmetic must
not need GDAL to be checked, so they run anywhere the engine's pure layers run.
"""
from __future__ import annotations

import numpy as np
import pytest

from src.utils import commodities as cm


def _layers(**overrides: float) -> dict[str, np.ndarray]:
    """A 4x4 AOI where every evidence layer reads 0.5 unless overridden."""
    base = {key: np.full((4, 4), 0.5, dtype="float32") for key in cm.EVIDENCE_KEYS}
    for key, value in overrides.items():
        base[key] = np.full((4, 4), value, dtype="float32")
    return base


def test_catalogue_is_internally_consistent() -> None:
    cm.validate()  # raises if a weight set does not sum to 1.0

    for commodity in cm.COMMODITIES:
        assert set(commodity.weights) <= set(cm.EVIDENCE_KEYS)
        assert commodity.confidence in {"High", "Moderate", "Low"}
        assert commodity.confidence_note
        assert commodity.verification


def test_every_commodity_carries_its_own_weights() -> None:
    # Two commodities with identical weights would be one model wearing two names.
    fingerprints = {tuple(sorted(c.weights.items())) for c in cm.COMMODITIES}
    assert len(fingerprints) == len(cm.COMMODITIES)


def test_gold_keeps_the_historic_model_weights() -> None:
    assert cm.GOLD.weights == {
        "lineament_density": 0.28,
        "lineament_intersections": 0.18,
        "iron_oxide": 0.14,
        "hydroxyl_clay": 0.14,
        "ferrous_mafic": 0.12,
        "relative_relief": 0.08,
        "endowment": 0.06,
    }


def test_identity_layers_produce_a_mid_index() -> None:
    index = cm.commodity_index(_layers(), cm.GOLD.weights)
    assert index.shape == (4, 4)
    assert np.allclose(index, 50.0)


def test_index_follows_the_layer_it_weights_hardest() -> None:
    # Iron ore leans on iron oxide, so raising only that layer must lift it most.
    iron = cm.commodity_index(_layers(iron_oxide=1.0), cm.IRON_ORE.weights)
    gold = cm.commodity_index(_layers(iron_oxide=1.0), cm.GOLD.weights)
    assert np.allclose(iron, 50.0 + cm.IRON_ORE.weights["iron_oxide"] * 50.0)
    assert np.all(iron > gold)


def test_a_missing_layer_is_scored_on_the_evidence_that_is_present() -> None:
    layers = _layers()
    del layers["endowment"]  # a commodity model may reference a layer we lack
    index = cm.commodity_index(layers, cm.GOLD.weights)
    assert np.allclose(index, 50.0)


def test_thin_coverage_is_refused_rather_than_guessed() -> None:
    layers = {key: np.full((4, 4), np.nan, dtype="float32") for key in cm.EVIDENCE_KEYS}
    # Only the smallest weight survives: below MIN_WEIGHT_COVERAGE, so no score.
    layers["endowment"] = np.full((4, 4), 1.0, dtype="float32")
    index = cm.commodity_index(layers, cm.GOLD.weights)
    assert np.all(np.isnan(index))


def test_no_data_cells_stay_no_data() -> None:
    # Iron oxide carries 0.42 of the iron model: losing it leaves 0.58 of the
    # weight, below the coverage floor, so that cell is refused rather than
    # scored on the rest.
    layers = _layers()
    layers["iron_oxide"][2, 3] = np.nan
    index = cm.commodity_index(layers, cm.IRON_ORE.weights)
    assert np.isnan(index[2, 3])
    assert np.isfinite(index[0, 0])

    # A minor layer going missing does not invalidate the cell.
    layers = _layers()
    layers["endowment"][2, 3] = np.nan
    index = cm.commodity_index(layers, cm.GOLD.weights)
    assert np.isfinite(index[2, 3])

    all_nan = cm.commodity_index(
        {k: np.full((4, 4), np.nan) for k in cm.EVIDENCE_KEYS}, cm.IRON_ORE.weights
    )
    assert np.all(np.isnan(all_nan))


def test_bands_read_the_way_the_report_words_them() -> None:
    assert cm.band_of(85) == "High"
    assert cm.band_of(cm.BAND_MODERATE) == "Moderate"
    assert cm.band_of(50) == "Low"
    assert cm.band_of(20) == "Not indicated"
    assert cm.band_of(None) == "Not indicated"
    assert cm.band_of(float("nan")) == "Not indicated"


def test_evidence_is_ranked_by_weight_times_value() -> None:
    layers = _layers(relative_relief=1.0, endowment=0.0)
    top = cm.evidence_at(layers, cm.GOLD.weights, 0, 0, top=2)
    assert [item["evidence"] for item in top] == ["lineament_density", "lineament_intersections"]
    # A zero-weight-on-paper layer that reads highest still cannot lead.
    assert all(item["evidence"] != "endowment" for item in top)

    relief_first = cm.evidence_at(
        {**_layers(), "relative_relief": np.full((4, 4), 1.0)}, cm.IRON_ORE.weights, 0, 0
    )
    assert relief_first[0]["evidence"] in {"iron_oxide", "relative_relief"}


def test_a_strong_area_is_indicated_and_a_weak_one_is_not() -> None:
    strong = cm.rank_commodities(_layers(), target=(1, 1))  # every layer reads 0.5
    assert all(item["indicated"] is False for item in strong)

    # Uniform but strong evidence has no target in it: same score in every cell.
    flat = cm.rank_commodities(
        {k: np.full((4, 4), 1.0, dtype="float32") for k in cm.EVIDENCE_KEYS}, target=(1, 1)
    )
    assert flat and not any(item["indicated"] for item in flat)
    assert all(item["area_contrast"] == 0.0 for item in flat)

    # A gradient through the same strong evidence does have one.
    ramp = np.tile(np.linspace(0.35, 1.0, 4), (4, 1)).astype("float32")
    hot = cm.rank_commodities({k: ramp for k in cm.EVIDENCE_KEYS}, target=(1, 1))
    assert hot and all(item["indicated"] for item in hot)
    assert all(item["area_contrast"] >= cm.MIN_CONTRAST for item in hot)


def test_iron_led_evidence_ranks_iron_above_lithium() -> None:
    layers = {k: np.full((4, 4), 0.2, dtype="float32") for k in cm.EVIDENCE_KEYS}
    layers["iron_oxide"] = np.full((4, 4), 1.0, dtype="float32")
    layers["ferrous_mafic"] = np.full((4, 4), 1.0, dtype="float32")
    by_key = {item["key"]: item for item in cm.rank_commodities(layers, target=(1, 1))}
    assert by_key["iron_ore"]["area_top_decile"] > by_key["lithium"]["area_top_decile"]
    assert by_key["iron_ore"]["area_top_decile"] > by_key["gold"]["area_top_decile"]


def test_ranking_reports_the_target_cell_and_its_drivers() -> None:
    ranked = cm.rank_commodities(_layers(iron_oxide=1.0), target=(2, 3))
    iron = next(item for item in ranked if item["key"] == "iron_ore")
    assert iron["target_score"] is not None
    assert iron["target_band"] in {"Moderate", "High"}
    assert iron["top_evidence"][0]["evidence"] == "iron_oxide"


def test_open_water_and_built_up_ground_are_excluded() -> None:
    layers = _layers(iron_oxide=1.0)
    mask = np.zeros((4, 4), dtype=bool)
    mask[0, :] = True  # a quarter of the AOI is water
    masked = cm.rank_commodities(layers, mask=mask, target=(3, 3))
    unmasked = cm.rank_commodities(layers, target=(3, 3))
    iron_masked = next(i for i in masked if i["key"] == "iron_ore")
    iron_unmasked = next(i for i in unmasked if i["key"] == "iron_ore")
    assert iron_masked["share_high_pct"] <= iron_unmasked["share_high_pct"]


def test_a_supplied_index_is_used_instead_of_recomputing() -> None:
    layers = _layers()
    supplied = np.full((4, 4), 12.0)
    ranked = cm.rank_commodities(layers, indices={"gold": supplied})
    gold = next(item for item in ranked if item["key"] == "gold")
    assert gold["area_mean"] == 12.0
    assert gold["area_band"] == "Not indicated"


def test_unscreenable_commodities_say_why_and_what_would_be_needed() -> None:
    payload = cm.unscreened_payload()
    assert payload, "silence about unscreenable commodities reads as 'nothing there'"
    for entry in payload:
        assert entry["reason"] and entry["needs"]
        # A commodity the pipeline cannot score must not also carry a score model.
        assert entry["key"] not in cm.BY_KEY


def test_headline_names_only_the_indicated_commodities() -> None:
    ramp = np.tile(np.linspace(0.2, 1.0, 4), (4, 1)).astype("float32")
    names = cm.headline(cm.rank_commodities({k: ramp for k in cm.EVIDENCE_KEYS}, target=(0, 0)))
    assert names and len(names) <= 3

    cold = cm.rank_commodities(_layers(), target=(0, 0))
    assert cm.headline(cold) == []


def test_a_cell_scores_exactly_as_the_area_index_does() -> None:
    layers = _layers(iron_oxide=0.9, lineament_density=0.3)
    for commodity in cm.COMMODITIES:
        index = cm.commodity_index(layers, commodity.weights)
        for row in range(4):
            for col in range(4):
                assert cm.cell_index(layers, commodity.weights, row, col) == pytest.approx(
                    float(index[row, col])
                ), f"{commodity.key} disagrees with its own area index at {(row, col)}"


def test_a_cell_with_missing_evidence_renormalizes_rather_than_losing_weight() -> None:
    layers = _layers()
    layers["endowment"] = np.full((4, 4), np.nan, dtype="float32")
    # A raw weighted sum would read 47 here; the index scores the evidence present.
    assert cm.cell_index(layers, cm.GOLD.weights, 1, 1) == pytest.approx(50.0)
    assert cm.commodity_index(layers, cm.GOLD.weights)[1, 1] == pytest.approx(50.0)


def test_a_cell_below_the_weight_coverage_floor_is_not_scored() -> None:
    layers = {key: np.full((4, 4), np.nan, dtype="float32") for key in cm.EVIDENCE_KEYS}
    layers["iron_oxide"] = np.full((4, 4), 0.8, dtype="float32")
    assert cm.cell_index(layers, cm.GOLD.weights, 0, 0) is None
    assert np.isnan(cm.commodity_index(layers, cm.GOLD.weights)[0, 0])
