"""Zone polygonisation: the classification has to reach the map as real geometry.

These tests pin the contract the web map depends on. Each region is its own Polygon
feature, because Leaflet renders a MultiPolygon by flattening its rings into one polygon
whose extra rings become holes in the first. Coordinates are WGS84 lon/lat, no-data cells
are absent, and the areas are the ground the zones actually cover.
"""
from __future__ import annotations

import json

import numpy as np
import pytest
from affine import Affine
from pyproj import CRS

import src.config as cfg
from src.utils.classification import NODATA_CLASS, export_zone_polygons


CELL = 30.0
ORIGIN_X = 400_000.0
ORIGIN_Y = 3_000_000.0
CELL_AREA_HA = CELL * CELL / 10_000.0


@pytest.fixture()
def grid(monkeypatch):
    """A 10 x 10 grid of 30 m cells, anchored in UTM zone 35S."""
    monkeypatch.setattr(cfg, "CELL", CELL, raising=False)
    monkeypatch.setattr(cfg, "LOCAL_CRS", CRS.from_epsg(32735), raising=False)
    monkeypatch.setattr(
        cfg,
        "TRANSFORM",
        Affine(CELL, 0.0, ORIGIN_X, 0.0, -CELL, ORIGIN_Y),
        raising=False,
    )
    return np.zeros((10, 10), dtype="uint8")


def test_export_refuses_without_a_configured_grid(monkeypatch, tmp_path):
    monkeypatch.setattr(cfg, "LOCAL_CRS", None, raising=False)
    monkeypatch.setattr(cfg, "TRANSFORM", None, raising=False)

    with pytest.raises(RuntimeError):
        export_zone_polygons(np.zeros((4, 4), dtype="uint8"), tmp_path / "zones.geojson")


def test_each_region_is_its_own_polygon_feature(grid, tmp_path):
    grid[:] = 4
    grid[3:7, 3:7] = 5

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=2)

    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) == 2
    for feature in payload["features"]:
        assert feature["geometry"]["type"] == "Polygon"
        assert feature["type"] == "Feature"


def test_a_class_surrounded_by_another_keeps_its_hole(grid, tmp_path):
    grid[:] = 4
    grid[3:7, 3:7] = 5

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=2)
    outer = next(f for f in payload["features"] if f["properties"]["class_code"] == 4)

    # The class-4 region is the whole square minus the block the class-5 region took.
    assert len(outer["geometry"]["coordinates"]) == 2
    assert outer["properties"]["area_ha"] == pytest.approx(84 * CELL_AREA_HA, rel=0.01)


def test_areas_match_the_cells_the_zones_cover(grid, tmp_path):
    grid[:] = 4
    grid[3:7, 3:7] = 5

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=2)
    by_class = {f["properties"]["class_code"]: f["properties"]["area_ha"] for f in payload["features"]}

    assert by_class[4] == pytest.approx(84 * CELL_AREA_HA, rel=0.01)
    assert by_class[5] == pytest.approx(16 * CELL_AREA_HA, rel=0.01)


def test_no_data_cells_are_not_published(grid, tmp_path):
    grid[:] = 4
    grid[0:2, 0:2] = NODATA_CLASS

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=2)

    codes = {f["properties"]["class_code"] for f in payload["features"]}
    assert NODATA_CLASS not in codes
    assert 4 in codes


def test_an_empty_survey_still_writes_a_readable_file(grid, tmp_path):
    grid[:] = NODATA_CLASS
    path = tmp_path / "zones.geojson"

    payload = export_zone_polygons(grid, path, min_region_cells=2)

    assert payload["features"] == []
    assert json.loads(path.read_text(encoding="utf-8"))["type"] == "FeatureCollection"


def test_coordinates_are_wgs84_and_the_file_follows_rfc_7946(grid, tmp_path):
    grid[:] = 4

    path = tmp_path / "zones.geojson"
    payload = export_zone_polygons(grid, path, min_region_cells=2)
    written = json.loads(path.read_text(encoding="utf-8"))

    assert "crs" not in written
    assert payload["metadata"]["crs"] == "EPSG:4326"

    for feature in payload["features"]:
        for ring in feature["geometry"]["coordinates"]:
            for lon, lat in ring:
                assert -180.0 <= lon <= 180.0
                assert -90.0 <= lat <= 90.0
            assert ring[0] == ring[-1], "a ring must close"


def test_the_legend_aggregates_the_regions_of_a_class(grid, tmp_path):
    grid[:] = 4
    grid[0:3, 0:3] = 5
    grid[7:10, 7:10] = 5

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=2)
    legend = {entry["class_code"]: entry for entry in payload["metadata"]["legend"]}

    assert legend[5]["region_count"] == 2
    assert legend[5]["area_ha"] == pytest.approx(18 * CELL_AREA_HA, rel=0.01)
    assert legend[4]["region_count"] == 1


def test_the_labels_and_colours_come_from_the_category(grid, tmp_path):
    grid[:] = 4

    payload = export_zone_polygons(
        grid,
        tmp_path / "zones.geojson",
        category="minerals",
        min_region_cells=2,
    )
    feature = payload["features"][0]

    assert feature["properties"]["class_label"] == "High prospectivity"
    assert feature["properties"]["color"].startswith("#")


def test_speckle_is_sieved_into_the_neighbour_that_dominates_it(grid, tmp_path):
    grid[:] = 4
    grid[5, 5] = 5  # a single cell of noise

    payload = export_zone_polygons(grid, tmp_path / "zones.geojson", min_region_cells=12)

    codes = {f["properties"]["class_code"] for f in payload["features"]}
    assert codes == {4}
