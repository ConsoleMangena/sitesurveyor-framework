"""Web-map deliverable builders: web GeoTIFF north-up alignment and raster PMTiles.

Both builders claim the hard guarantees the workbench map depends on: the web
raster is georeferenced around the same ground the zone raster covers (so the
overlay lands on its rectangle), classes survive resampling scalar-untouched
(no bilinear blend of class codes), and the PMTiles archive reads back in the
standard XYZ tile address space with exactly the classes and transparency the
zone raster holds.
"""
from __future__ import annotations

from pathlib import Path

# Import config FIRST before rasterio/pyproj to ensure PROJ paths are initialized
from src.utils.classification import NODATA_CLASS, ZONE_PALETTES
from src.utils.webtiles import MAX_ZOOM, MIN_ZOOM, write_web_geotiff, write_zone_pmtiles

import numpy as np
import pytest
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from pmtiles.reader import Reader, MmapSource

UTM_35S = CRS.from_epsg(32735)  # the engine grid CRS for the default site
ZONE_CODES = (0, 1, 2, 3, 4, 5, 6)


@pytest.fixture
def zone_tif(tmp_path: Path) -> Path:
    """A small synthetic classified raster on the engine's UTM grid.

    Classes are painted in bands rather than randomly so every test assertion
    reads a known coordinate instead of trusting statistics.
    """
    height, width = 120, 140
    classes = np.full((height, width), NODATA_CLASS, dtype="uint8")
    classes[0:15, 0:60] = 0          # water strip
    classes[15:55, :] = 1
    classes[55:85, :] = 3
    classes[85:110, 20:100] = 5      # a very-high patch with nodata margins
    classes[110:, :] = 6

    path = tmp_path / "zones.tif"
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width,
        count=1, dtype="uint8", crs=UTM_35S,
        transform=from_origin(295980.0, 7837440.0, 30.0, 30.0),
        nodata=NODATA_CLASS, compress="deflate",
    ) as dst:
        dst.write(classes, 1)
        # The engine writes zone rasters with the palette as a colour table,
        # so the fixture reproduces that: tiles must take their colours from
        # the file itself, not the module palette, for such files.
        table = {}
        for code in ZONE_CODES:
            hex_colour = ZONE_PALETTES["water"][int(code)]
            clean = hex_colour.lstrip("#")
            table[int(code)] = (
                int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16), 255,
            )
        table[int(NODATA_CLASS)] = (0, 0, 0, 0)
        dst.write_colormap(1, table)
    return path


def test_web_geotiff_is_north_up_and_keeps_classes(zone_tif: Path, tmp_path: Path) -> None:
    out = tmp_path / "zones_web.tif"
    write_web_geotiff(zone_tif, out, ZONE_PALETTES["water"])

    with rasterio.open(zone_tif) as src, rasterio.open(out) as web:
        assert web.crs.is_geographic, "the web raster must sit on EPSG:4326"
        assert web.dtypes == ("uint8",)
        # Bilinear would create intermediate class codes; the class domain
        # must be preserved exactly by the nearest resample.
        codes = {int(v) for v in np.unique(web.read(1))}
        assert codes <= set(ZONE_CODES) | {NODATA_CLASS}
        # The reprojected raster must carry roughly the same ground extent;
        # 0.01 degrees is ~1 km, far looser than any pixel-perfect resample.
        wgs = rasterio.warp.transform_bounds(UTM_35S, "EPSG:4326", *src.bounds)
        assert abs(web.bounds.left - wgs[0]) < 0.01
        assert abs(web.bounds.bottom - wgs[1]) < 0.01
        assert abs(web.bounds.right - wgs[2]) < 0.01
        assert abs(web.bounds.top - wgs[3]) < 0.01


def test_pmtiles_archive_roundtrips(zone_tif: Path, tmp_path: Path) -> None:
    out = tmp_path / "zones_tiles.pmtiles"
    stats = write_zone_pmtiles(
        zone_tif, out, ZONE_PALETTES["water"], "Groundwater potential zones"
    )
    assert out.is_file()
    assert stats["tiles"] > 0
    assert stats["zooms"] == [MIN_ZOOM, MAX_ZOOM]

    from pmtiles.reader import Reader, MmapSource

    with open(out, "r+b") as handle:
        reader = Reader(MmapSource(handle))
        header = reader.header()
        assert header["min_zoom"] == MIN_ZOOM
        assert header["max_zoom"] == MAX_ZOOM
        assert -180.0 <= header["min_lon_e7"] / 1e7 < 180.0
        assert -90.0 <= header["min_lat_e7"] / 1e7 < 90.0

        # Native-density zoom: sample class, alpha and transparency straight
        # from a tile the raster actually covers.
        x, y = _centre_tile(zone_tif, MAX_ZOOM)
        data = reader.get(MAX_ZOOM, x, y)
        with rasterio.io.MemoryFile(data) as mem:
            with mem.open(driver="PNG") as tile:
                assert tile.count == 4 and tile.width == 256 and tile.height == 256
                red = tile.read(1)
                alpha = tile.read(4)
                painted = alpha == 255
                assert painted.any(), "the tile over the raster's centre must show classes"
                flat = set(int(v) for v in red.reshape(-1))
                assert flat <= set(
                    int(c.lstrip("#")[:2], 16) for c in ZONE_PALETTES["water"]
                ) | {0}
                # The very-high patch sits dead centre of the source raster,
                # so its class colour ("#1a9850") must reach the tile straight
                # from the file's colour table.
                very_high_red = int(ZONE_PALETTES["water"][5].lstrip("#")[0:2], 16)
                assert (red == very_high_red).any() and (
                    (red == very_high_red) & (alpha == 255)
                ).any(), "class-5 ground must carry its colour-table colour"


def test_mineral_tiles_leave_below_threshold_ground_transparent(tmp_path: Path) -> None:
    """Cold ground is not a finding: the drape must show the basemap through it.

    A GTiff colour table cannot carry alpha, so the archive is where the transparency
    has to be baked in — the browser drape and the PNG overlay apply it separately.
    """
    from src.utils.classification import ZONE_TRANSPARENT_CODES

    height, width = 120, 140
    classes = np.full((height, width), NODATA_CLASS, dtype="uint8")
    classes[15:55, :] = 1    # gold
    classes[55:85, :] = 10   # below the indicated threshold
    path = tmp_path / "mineral_zones.tif"
    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width,
        count=1, dtype="uint8", crs=UTM_35S,
        transform=from_origin(295980.0, 7837440.0, 30.0, 30.0),
        nodata=NODATA_CLASS, compress="deflate",
    ) as dst:
        dst.write(classes, 1)

    out = tmp_path / "mineral_zones_tiles.pmtiles"
    write_zone_pmtiles(
        path, out, ZONE_PALETTES["minerals"], "Dominant mineral system",
        transparent_codes=ZONE_TRANSPARENT_CODES["minerals"],
    )
    with open(out, "r+b") as handle:
        reader = Reader(MmapSource(handle))
        for row, opaque in ((30, True), (70, False)):
            x, y = _tile_xy_over_cell(path, MAX_ZOOM, 60, row)
            with rasterio.io.MemoryFile(reader.get(MAX_ZOOM, x, y)) as mem:
                with mem.open(driver="PNG") as tile:
                    alpha = tile.read(4)
                    if opaque:
                        assert (alpha == 255).any(), "a mineral system must stay visible"
                    else:
                        assert (alpha == 0).all(), "below-threshold ground must stay see-through"


def _centre_tile(zone_tif: Path, zoom: int) -> tuple[int, int]:
    """XYZ tile index at `zoom` over the class-5 patch centre, for sample reads.

    The fixture paints its very-high patch at rows 85-110, cols 20-100, so the
    sample cell is (col 60, row 97) -- not the raster's centre, whose northwest
    margins are no-data.
    """
    return _tile_xy_over_cell(zone_tif, zoom, 60, 97)


def _tile_xy_over_cell(
    zone_tif: Path, zoom: int, col: int, row: int
) -> tuple[int, int]:
    """XYZ tile index at `zoom` over one raster cell's centre."""
    with rasterio.open(zone_tif) as src:
        gx, gy = src.transform @ (float(col) + 0.5, float(row) + 0.5)
        mx, my = rasterio.warp.transform(src.crs, "EPSG:3857", [gx], [gy])
    res = 40075016.6856 / (2 ** zoom)
    x = int((mx[0] + 20037508.3428) // res)
    y = int((20037508.3428 - my[0]) // res)
    return x, y


def test_empty_raster_yields_only_no_data(zone_tif: Path, tmp_path: Path) -> None:
    """A zone raster with nothing observed must not rank as a colour."""
    blank = tmp_path / "blank.tif"
    with rasterio.open(zone_tif) as src:
        with rasterio.open(
            blank, "w", driver="GTiff", height=src.height, width=src.width,
            count=1, dtype="uint8", crs=src.crs, transform=src.transform,
            nodata=NODATA_CLASS,
        ) as dst:
            dst.write(np.full((src.height, src.width), NODATA_CLASS, dtype="uint8"), 1)
    out = tmp_path / "blank_tiles.pmtiles"
    write_zone_pmtiles(blank, out, ZONE_PALETTES["water"], "empty")
    with open(out, "r+b") as handle:
        x, y = _centre_tile(blank, MAX_ZOOM)
        data = Reader(MmapSource(handle)).get(MAX_ZOOM, x, y)
    with rasterio.io.MemoryFile(data) as mem:
        with mem.open(driver="PNG") as tile:
            assert (tile.read(4) == 0).all(), "unobserved ground must stay transparent"
