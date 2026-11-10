"""Exercise soil/hazard wiring with real rasters, analysis, and deliverables."""
from __future__ import annotations

import csv
import json
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pytest

import src.config as cfg
from src.engines import hazard, soil
from src.utils.classification import NODATA_CLASS, classify_zones, jenks_breaks
from src.utils.raster import lonlat_to_pixel

rasterio = pytest.importorskip("rasterio")


@pytest.fixture(params=["soil", "hazard"])
def engine(request):
    if request.param == "soil":
        return SimpleNamespace(
            module=soil, run=soil.run_soil_survey, name="soil",
            index="soil_capability_index.tif", zones="soil_capability_zones.tif",
            candidates="candidate_areas",
        )
    return SimpleNamespace(
        module=hazard, run=hazard.run_hazard_survey, name="hazard",
        index="hazard_composite_index.tif", zones="hazard_risk_zones.tif",
        candidates="safest_candidate_sites",
    )


@pytest.fixture
def aoi(tmp_path, monkeypatch):
    # Register every field set_target_site changes BEFORE calling it, so even
    # an assertion/engine failure restores the previous site's global context.
    state_fields = (
        "TARGET_LAT", "TARGET_LON", "HALF_DEG", "BBOX_WGS84", "UTM_ZONE", "EPSG",
        "LOCAL_CRS", "TO_LOCAL", "TO_WGS", "TO_6933", "XMIN", "XMAX", "YMIN", "YMAX",
        "WIDTH", "HEIGHT", "TRANSFORM", "TARGET_X", "TARGET_Y", "TARGET_COL",
        "TARGET_ROW", "CLIENT", "CLIENT_ADDRESS", "RAW", "AOI_SLUG",
    )
    for name in state_fields:
        monkeypatch.setattr(cfg, name, getattr(cfg, name))
    monkeypatch.setattr(cfg, "CELL", 30.0)
    monkeypatch.setattr(cfg, "RAW_BASE", tmp_path / "raw")
    monkeypatch.setattr(cfg, "OUT", tmp_path / "outputs")
    cfg.OUT.mkdir()
    cfg.set_target_site(-19.5, 29.8, half_deg=0.015, client="Synthetic", address="Test AOI")

    fetch = Mock()
    monkeypatch.setattr("src.fetch_data.ensure_raw", fetch)
    for module, names in (
        (soil, ("_plot_soil_map", "_plot_evidence_layers", "_plot_zone_zoom")),
        (hazard, ("_plot_hazard_map", "_plot_hazard_evidence", "_plot_hazard_zoom")),
    ):
        for name in names:
            monkeypatch.setattr(module, name, Mock())

    shape = (cfg.HEIGHT, cfg.WIDTH)
    rows, cols = np.indices(shape, dtype="float32")
    y, x = rows / (shape[0] - 1), cols / (shape[1] - 1)
    bands = {
        "blue": 0.04 + 0.03 * x,
        "red": 0.15 + 0.10 * y,
        "nir": 0.35 + 0.20 * x + 0.03 * np.sin(y * 9),
        "swir_1": 0.20 + 0.10 * y + 0.03 * np.cos(x * 7),
        "swir_2": 0.42 + 0.08 * y,
    }
    dem = 1200 + 70 * x + 40 * y + 18 * np.sin(x * 10) * np.cos(y * 8)
    rain = 400 + 300 * y + 80 * np.sin(x * 6)
    wofs = 0.01 + 0.15 * x * y
    lc = np.full(shape, 30, dtype="float32")
    # Both exclusions reach INSIDE the real picker's 25-pixel border margin.
    lc[:, :shape[1] // 3] = 80
    lc[:, 2 * shape[1] // 3:] = 50
    # Also put a settlement on the low-risk northern ridge, where it would
    # compete with actual buildable candidates without the classification mask.
    lc[25:36, shape[1] // 2 - 6:shape[1] // 2 + 8] = 50

    def write(name, arrays, descriptions=None):
        with rasterio.open(
            cfg.RAW / name, "w", driver="GTiff", height=shape[0], width=shape[1],
            count=len(arrays), dtype="float32", crs=cfg.LOCAL_CRS,
            transform=cfg.TRANSFORM, nodata=np.nan,
        ) as dst:
            for number, array in enumerate(arrays, 1):
                dst.write(np.asarray(array, dtype="float32"), number)
                if descriptions:
                    dst.set_band_description(number, descriptions[number - 1])

    def write_inputs(coverage="full"):
        observed = np.ones(shape, dtype=bool)
        landcover = lc.copy()
        if coverage != "full":
            observed[:] = False
            landcover[:] = 30
            if coverage == "sparse":
                # Nine cells have a complete terrain stencil, all outside the
                # siting margin. A lone interior DEM sample is not valid slope.
                observed[5:10, 5:10] = True
                observed[cfg.TARGET_ROW, cfg.TARGET_COL] = True

        def masked(array):
            return np.where(observed, array, np.nan)

        write("dem.tif", [masked(dem)])
        write("rain_mean.tif", [masked(rain)])
        write("landcover.tif", [landcover])
        write("wofs.tif", [masked(np.ones(shape)), masked(np.ones(shape)), masked(wofs)])
        write("optical.tif", [masked(b * 10000) for b in bands.values()], list(bands))
        return observed

    write_inputs()
    return SimpleNamespace(
        root=tmp_path, out=cfg.OUT, shape=shape, bands=bands, landcover=lc,
        x=x, y=y, write=write, write_inputs=write_inputs, fetch=fetch,
    )


def _read_raster(path):
    with rasterio.open(path) as src:
        return src.read(1)


def _assert_strict_summary(summary, path):
    def reject_constant(value):
        raise AssertionError(f"Non-JSON numeric constant in {path.name}: {value}")

    published = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    assert published == json.loads(json.dumps(summary, allow_nan=False))


def test_bsi_receives_blue_not_swir2(engine, aoi, monkeypatch):
    # Observe the call without replacing the spectral calculation or its result.
    bsi = Mock(wraps=engine.module.bare_soil_index)
    monkeypatch.setattr(engine.module, "bare_soil_index", bsi)

    summary = engine.run()

    bsi.assert_called_once()
    for actual, name in zip(bsi.call_args.args, ("red", "swir_1", "nir", "blue"), strict=True):
        np.testing.assert_allclose(actual, aoi.bands[name], atol=1e-7)
    assert not np.allclose(bsi.call_args.args[3], aoi.bands["swir_2"])
    assert np.isfinite(_read_raster(aoi.out / engine.index)).all()
    aoi.fetch.assert_called_once()
    assert "optical.tif" in aoi.fetch.call_args.args[0]
    _assert_strict_summary(summary, aoi.out / f"{engine.name}_summary.json")


def test_hazard_classes_breaks_and_exported_candidates_exclude_water_and_builtup(aoi):
    summary = hazard.run_hazard_survey()
    index = _read_raster(aoi.out / "hazard_composite_index.tif")
    zones = _read_raster(aoi.out / "hazard_risk_zones.tif")
    safety = _read_raster(aoi.out / "site_safety_index.tif")
    water, builtup = aoi.landcover == 80, aoi.landcover == 50
    eligible = ~(water | builtup)

    assert np.all(zones[water] == 0)
    assert np.all(zones[builtup] == 6)
    assert set(np.unique(zones[eligible])) <= {1, 2, 3, 4, 5}
    np.testing.assert_allclose(index[water], 100)
    np.testing.assert_allclose(safety, 100 - index)

    breaks = jenks_breaks(index[eligible], k=5)
    assert summary["jenks_breaks"] == [round(float(b), 2) for b in breaks]
    # This AOI must actually detect contamination of the learned thresholds.
    assert not np.allclose(breaks, jenks_breaks(index.ravel(), k=5))
    np.testing.assert_array_equal(zones[eligible], classify_zones(index, breaks)[eligible])
    safety_breaks = jenks_breaks(safety[eligible], k=5)
    unmasked_safety_classes = classify_zones(safety, safety_breaks)
    assert np.any((unmasked_safety_classes[25:-25, 25:-25] >= 4) & builtup[25:-25, 25:-25]), (
        "fixture must contain apparently safe built-up cells inside the siting margin"
    )

    candidates = summary["safest_candidate_sites"]
    assert candidates, "exclusion assertions must inspect actual selected sites"
    for candidate in candidates:
        row, col = candidate["row"], candidate["col"]
        assert eligible[row, col]
        assert zones[row, col] in (1, 2)
        assert candidate["class_code"] == unmasked_safety_classes[row, col]
        assert candidate["potential_score"] == pytest.approx(round(float(safety[row, col]), 1))
        assert lonlat_to_pixel(candidate["longitude"], candidate["latitude"]) == (row, col)

    with (aoi.out / "safest_buildable_sites.csv").open(newline="", encoding="utf-8") as fh:
        exported = list(csv.DictReader(fh))
    assert [(int(c["row"]), int(c["col"])) for c in exported] == [
        (c["row"], c["col"]) for c in candidates
    ]
    geojson = json.loads((aoi.out / "safest_buildable_sites.geojson").read_text(encoding="utf-8"))
    assert [f["geometry"]["coordinates"] for f in geojson["features"]] == [
        [c["longitude"], c["latitude"]] for c in candidates
    ]
    _assert_strict_summary(summary, aoi.out / "hazard_summary.json")


@pytest.mark.parametrize("coverage", ["nan", "sparse"])
def test_missing_evidence_does_not_invent_candidates_or_json_numbers(engine, aoi, coverage):
    observed = aoi.write_inputs(coverage)
    summary = engine.run()
    index = _read_raster(aoi.out / engine.index)
    zones = _read_raster(aoi.out / engine.zones)

    assert np.isnan(index[~observed]).all()
    assert np.all(zones[~observed] == NODATA_CLASS)
    assert np.isnan(index[cfg.TARGET_ROW, cfg.TARGET_COL])
    assert zones[cfg.TARGET_ROW, cfg.TARGET_COL] == NODATA_CLASS
    assert summary[engine.candidates] == []
    assert not list(aoi.out.glob("*.csv"))
    assert not list(aoi.out.glob("*.geojson"))
    if coverage == "sparse":
        assert 0 < np.isfinite(index).sum() < 25, "exercise the sparse natural-break path"
    else:
        assert np.isnan(index).all()
    if engine.name == "soil":
        assert summary["target_sci_score"] is None
        assert summary["local_150m_mean_score"] is None
        assert summary["target_sci_class"] == "No data"
    else:
        target = summary["target_assessment"]
        assert target["hazard_index_score"] is None
        assert target["safety_index_score"] is None
        assert target["local_150m_mean_hazard"] is None
        assert target["hazard_classification"].startswith("No data")
        safety = _read_raster(aoi.out / "site_safety_index.tif")
        assert np.isnan(safety[~observed]).all()
    _assert_strict_summary(summary, aoi.out / f"{engine.name}_summary.json")


@pytest.mark.parametrize("fractional_cover", ["valid", "incomplete"])
def test_optional_fractional_cover_integration_and_fallback(engine, aoi, monkeypatch, fractional_cover):
    baseline = engine.run()
    baseline_index = _read_raster(aoi.out / engine.index)
    provenance = baseline["deafrica_sandbox"]
    assert provenance["fractional_cover_file_present"] is False
    assert provenance["fractional_cover_integrated"] is False
    assert provenance["fractional_cover_error"] is None

    # Bands 2, 6 and 8 deliberately differ from one another and their neighbours.
    fc = [np.full(aoi.shape, number, dtype="float32") for number in range(1, 11)]
    fc[1] = 20 + 60 * aoi.y
    fc[5] = 80 - 60 * aoi.x
    fc[7] = 15 + 70 * aoi.x * (1 - aoi.y)
    # Hazard reads band 6 successfully before band 8 fails: partial integration
    # must be discarded, not used while reporting that the fallback was taken.
    aoi.write("fc_ls_2023.tif", fc if fractional_cover == "valid" else fc[:6])
    out = aoi.root / fractional_cover
    out.mkdir()
    monkeypatch.setattr(cfg, "OUT", out)
    summary = engine.run()
    index = _read_raster(out / engine.index)
    provenance = summary["deafrica_sandbox"]
    assert provenance["fractional_cover_file_present"] is True

    if fractional_cover == "valid":
        assert provenance["fractional_cover_integrated"] is True
        assert provenance["fractional_cover_error"] is None
        row, col = cfg.TARGET_ROW, cfg.TARGET_COL
        assert provenance["target_bare_soil_pct"] == pytest.approx(round(float(fc[7][row, col]), 1))
        if engine.name == "soil":
            key, band = "target_green_veg_pct", 1
        else:
            key, band = "target_peak_dry_fuel_pct", 5
        assert provenance[key] == pytest.approx(round(float(fc[band][row, col]), 1))
        assert not np.allclose(index, baseline_index), "fractional cover must affect the real index"
    else:
        assert provenance["fractional_cover_integrated"] is False
        assert provenance["fractional_cover_error"]
        assert provenance["target_bare_soil_pct"] is None
        key = "target_green_veg_pct" if engine.name == "soil" else "target_peak_dry_fuel_pct"
        assert provenance[key] is None
        np.testing.assert_allclose(index, baseline_index, equal_nan=True)
        assert summary[engine.candidates] == baseline[engine.candidates]
    _assert_strict_summary(summary, out / f"{engine.name}_summary.json")
