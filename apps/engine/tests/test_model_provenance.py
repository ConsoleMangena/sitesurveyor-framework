from __future__ import annotations

import json
import os

import pytest

import src.config as cfg
import src.fetch_data as fd
from src.mcp.server import _cached_summary
from src.utils.provenance import capture_provenance, input_manifest, model_identity


@pytest.fixture
def recorded_site(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    raw.mkdir()
    monkeypatch.setattr(cfg, "RAW", raw)
    monkeypatch.setattr(cfg, "TARGET_LAT", -19.0)
    monkeypatch.setattr(cfg, "TARGET_LON", 29.9)
    (raw / "rain_mean.tif").write_bytes(b"rain A")
    (raw / "rain_mean.src").write_text("rainfall_chirps_monthly observed_months=2023-01", encoding="utf-8")
    summary = {
        "target_coordinates": {"latitude": -19.0, "longitude": 29.9},
        "provenance": capture_provenance("soil", ["rain_mean.tif"]),
    }
    path = tmp_path / "soil_summary.json"
    path.write_text(json.dumps(summary, allow_nan=False), encoding="utf-8")
    assert _cached_summary(path, -19.0, 29.9) == summary
    return path, summary


def test_model_identity_is_deterministic_and_snapshots_parameters(monkeypatch):
    first = model_identity()
    assert model_identity() == first
    key = next(iter(cfg.WATER_WEIGHTS))
    previous = cfg.WATER_WEIGHTS[key]
    monkeypatch.setitem(cfg.WATER_WEIGHTS, key, previous + 0.01)
    changed = model_identity()
    assert changed["parameters_sha256"] != first["parameters_sha256"]
    assert first["parameters"]["water_weights"][key] == previous


def test_model_version_hashes_code_but_normalizes_line_endings(tmp_path, monkeypatch):
    source = tmp_path / "src"
    source.mkdir()
    module = source / "model.py"
    module.write_bytes(b"WEIGHT = 1\r\n")
    monkeypatch.setattr(cfg, "ROOT", tmp_path)
    first = model_identity()["version"]
    module.write_bytes(b"WEIGHT = 1\n")
    assert model_identity()["version"] == first
    module.write_bytes(b"WEIGHT = 2\n")
    assert model_identity()["version"] != first


@pytest.mark.parametrize("change", ["bytes", "source", "missing", "optional", "model", "extent", "grid", "scenes"])
def test_cached_summary_rejects_changed_evidence(recorded_site, monkeypatch, change):
    path, summary = recorded_site
    if change == "bytes":
        raster = cfg.RAW / "rain_mean.tif"
        stamp = raster.stat()
        raster.write_bytes(b"rain B")
        os.utime(raster, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
    elif change == "source":
        (cfg.RAW / "rain_mean.src").write_text("another_source", encoding="utf-8")
    elif change == "missing":
        (cfg.RAW / "rain_mean.tif").unlink()
    elif change == "optional":
        (cfg.RAW / "fc_ls_2023.tif").write_bytes(b"new optional evidence")
    elif change == "model":
        key = next(iter(cfg.SOIL_WEIGHTS))
        monkeypatch.setitem(cfg.SOIL_WEIGHTS, key, cfg.SOIL_WEIGHTS[key] + 0.01)
    elif change == "extent":
        monkeypatch.setattr(cfg, "HALF_DEG", cfg.HALF_DEG * 2)
    elif change == "grid":
        monkeypatch.setattr(cfg, "WIDTH", cfg.WIDTH + 1)
    else:
        (cfg.RAW / "optical.scenes").write_text("2024-01-01", encoding="utf-8")
    assert _cached_summary(path, -19.0, 29.9) is None


def test_legacy_summary_without_fingerprints_is_not_reused(recorded_site):
    path, summary = recorded_site
    del summary["provenance"]
    path.write_text(json.dumps(summary), encoding="utf-8")
    assert _cached_summary(path, -19.0, 29.9) is None


def test_captured_inputs_include_absent_optional_evidence_and_field_validation(recorded_site):
    _, summary = recorded_site
    record = summary["provenance"]
    assert record["inputs"]["crop_mask.tif"] == {"status": "missing"}
    assert record["used_inputs"] == ["rain_mean.tif"]
    assert record["inputs"]["rain_mean.tif"]["sha256"]
    validation = record["field_validation"]
    assert validation["status"] == "not_validated_against_field_measurements"
    assert validation["reference_observations"] == 0
    assert validation["accuracy"] is None
    assert validation["confidence_interval"] is None
    assert record["score_basis"] == "aoi_relative_weighted_index"
    assert "not percentiles, probabilities" in record["claim_ceiling"]
    assert json.loads(json.dumps(record, allow_nan=False)) == record


def test_source_attribution_does_not_invent_unrecorded_or_unused_inputs(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg, "RAW", tmp_path)
    (tmp_path / "dem.tif").write_bytes(b"dem")
    (tmp_path / "optical.src").write_text(cfg.composite_signature(), encoding="utf-8")
    (tmp_path / "rain_mean.tif").write_bytes(b"rain")
    assert fd.provenance("dem") == ""
    assert input_manifest(["dem.tif"])["dem.tif"]["source_record"] is None
    sources = fd.used_sources(layers=["dem", "optical"])
    assert not sources["fixed"]
    assert all(entry["label"] == "Source not recorded" for entry in sources["selectable"].values())
    (tmp_path / "optical.tif").write_bytes(b"optical")
    (tmp_path / "optical.src").write_text("s2_gm invalid annual", encoding="utf-8")
    assert "composite" not in fd.used_sources(layers=["optical"])["selectable"]["optical"]


@pytest.mark.parametrize("category", ["water", "minerals", "soil", "hazard"])
def test_report_uses_captured_sources_and_honest_score_wording(tmp_path, monkeypatch, category):
    from src.category_report import build_report_html, get

    monkeypatch.setattr(cfg, "OUT", tmp_path)
    monkeypatch.setattr(cfg, "RAW", tmp_path)
    (tmp_path / "optical.src").write_text("new-live-source 2024 annual", encoding="utf-8")
    data = {
        "target_coordinates": {"latitude": -19.5, "longitude": 29.8},
        "provenance": {"data_sources": {
            "selectable": {"optical": {
                "coverage": "recorded-source", "label": "Recorded imagery 2023",
                "credit": "Recorded agency <unsafe>",
            }},
            "fixed": {},
        }},
    }
    html = build_report_html(get(category), data)
    assert "Recorded imagery 2023" in html
    assert "Recorded agency &lt;unsafe&gt;" in html
    assert "<unsafe>" not in html
    assert "new-live-source" not in html
    assert "Every score is a percentile" not in html
    assert "probability zoning" not in html
    assert "not been validated against field measurements" in html
    assert "JAXA ALOS" not in html
    assert "CHIRPS precipitation" not in html

    legacy = build_report_html(get(category), {})
    assert "Input provenance not recorded for this survey" in legacy
    assert "new-live-source" not in legacy
