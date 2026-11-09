"""
SiteSurveyor AI — Web-map deliverables (zoomable raster layers)
===============================================================
The classified zone GeoTIFFs live on the engine's local UTM grid, and the
browser drape reads them as one north-up image placed on a lat/lon rectangle.
A projected CRS is therefore drawn slightly rotated and stretched, and every
map fetch re-renders the whole region as a single picture.

These builders give the workbench two view-ready deliverables per category,
without changing one analysis pixel's class code:

  <zones>_web.tif         the same classes reprojected north-up onto
                          EPSG:4326 with the colour table attached, so the
                          existing browser drape sits exactly on its
                          lat/lon rectangle;
  <zones>_tiles.pmtiles   the same classes as a single-file raster PMTiles
                          archive (PNG tiles on EPSG:3857, transparent
                          no-data), so the map pans and zooms as real map
                          tiles instead of one stretched image.

Tiles are cut across zooms 7-16: a 30 m analysis cell is native ground
resolution near zoom 16 (a 256 px tile is then ~611 m wide), and below zoom 7
the AOI is a sub-tile sliver nothing reads. Classification's no-data class
(255) keeps both outputs honest: unobserved ground stays transparent in the
archive and no-data in the raster, never a colourised rank.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Sequence

# Import config FIRST before rasterio/pyproj so PROJ paths are initialized
import src.config as cfg

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.io import MemoryFile
from rasterio.transform import Affine
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds
from rasterio.windows import Window, transform as window_transform

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write as pmtiles_write

logger = logging.getLogger("sitesurveyor.tiles")

WORLD_CRS = CRS.from_epsg(3857)
GEO_CRS = CRS.from_epsg(4326)

# Earth's equatorial circumference in Web Mercator metres: the spherical
# mercator figure carried by every tile library.
_WORLD_M = 40075016.6856

# Zoom band for tile cutting. MIN_ZOOM keeps the overview tiles a panner
# still touches; MAX_ZOOM is where the 30 m grid reaches native density.
MIN_ZOOM = 7
MAX_ZOOM = 16

TILE = 256

# GDAL's null log device differs by platform (the tile PNGs carry no georeferencing).
_CPL_LOG = "NUL" if os.name == "nt" else os.devnull

# Staging sentinel for resample destinations. The class domain owns 0-6 and
# 255, so a warp buffer whose no-data value is 255 collides with the domain
# and GDAL remaps samples to dodge itself. Warping through uint16 empties the
# collision: 65535 is outside every class range, so samples pass through
# untouched and the buffer is condensed back to uint8 afterwards.
_STAGING_NODATA = 65535

# Zones read from disk carry nothing outside the class domain, so a uint16
# buffer both stages the warp and rounds every real sample back to uint8.
def _staged_reproject(
    classes: np.ndarray,
    src_transform: Affine,
    src_crs: CRS,
    dst_transform: Affine,
    dst_crs: CRS,
    dst_width: int,
    dst_height: int,
) -> np.ndarray:
    """Warp class codes untouched, archived no-data 255 in, holes out as 255.

    Nothing in the resample touches the values themselves: classes are
    categorical, and bilinear anywhere here would invent zone codes no rule
    assigned to any ground.
    """
    staged = np.full((dst_height, dst_width), _STAGING_NODATA, dtype="uint16")
    reproject(
        source=classes,
        destination=staged,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        # The fill of every cell the source never reaches must equal the
        # staging sentinel: a default 0 would paint the whole surround as
        # class zero (water) wherever coverage ran out.
        dst_nodata=_STAGING_NODATA,
        init_dest_nodata=True,
        resampling=Resampling.nearest,
        num_threads=2,
    )
    condense: np.ndarray = staged.astype("uint8")
    # Belt and braces: 65535 truncates to 255 anyway, but state the intent.
    condense[staged == _STAGING_NODATA] = 255
    return condense


def _colour_lut(
    src: rasterio.DatasetReader, ranked_fallback: Sequence[str]
) -> np.ndarray:
    """Class colour table -> a 256x4 RGBA lookup over zone codes.

    The GeoTIFF colour table is the master: the engine wrote it from the same
    palette the report legend and web fallback use, so tiles cut from it agree
    with every other surface a class is painted on. `ranked_fallback` covers
    files written before the colour-table change and files without any table.
    Every class without a row, including no-data 255, renders fully
    transparent so a void can neither read as a rank nor hide imagery.
    """
    try:
        colours = src.colormap(1)
    except ValueError:
        colours = None
    lut = np.zeros((256, 4), dtype="uint8")
    if colours is not None:
        for code, rgba in colours.items():
            if not 0 <= int(code) <= 255:
                continue
            values = tuple(int(v) for v in rgba)
            lut[int(code), 0] = values[0]
            lut[int(code), 1] = values[1]
            lut[int(code), 2] = values[2]
            lut[int(code), 3] = values[3] if len(values) > 3 else 255
    else:
        for code, hex_colour in enumerate(ranked_fallback):
            clean = str(hex_colour).lstrip("#")
            if len(clean) != 6:
                continue
            lut[code] = (
                int(clean[0:2], 16),
                int(clean[2:4], 16),
                int(clean[4:6], 16),
                255,
            )
    return lut


def _png_bytes(
    red: np.ndarray, green: np.ndarray, blue: np.ndarray, alpha: np.ndarray
) -> bytes:
    """Encode one 256x256 RGBA tile as PNG bytes in memory.

    PNG rather than WebP even though it is larger: the class palettes have
    seven colours, so each tile rasterises to a handful of palette rows and
    PNG's row filters make such tiles tiny while staying lossless.
    """
    # The PNG driver logs "no geotransform" once per tile; a map tile is not
    # a geographic dataset, so route GDAL logging to the platform null file.
    with rasterio.Env(CPL_LOG=_CPL_LOG), MemoryFile() as mem:
        with mem.open(
            driver="PNG", width=TILE, height=TILE, count=4, dtype="uint8"
        ) as dst:
            dst.write(red, 1)
            dst.write(green, 2)
            dst.write(blue, 3)
            dst.write(alpha, 4)
        return mem.read()


def _window_px(
    transform: Affine,
    l: float, t: float, r: float, b: float,
    width: int, height: int, pad: int = 2,
) -> Window:
    """Pixel window of the source array touched by a map extent.

    `pad` keeps a rounding edge of the 256 px resample from pulling a lone
    edge row in as a hard line.
    """
    inv = ~transform
    # Applied term by term (affine inverse coefficients), avoiding the
    # matrix-mul operators that differ across affine versions.
    col_lt = inv.a * l + inv.b * t + inv.c
    row_lt = inv.d * l + inv.e * t + inv.f
    col_rb = inv.a * r + inv.b * b + inv.c
    row_rb = inv.d * r + inv.e * b + inv.f
    col0 = max(int(np.floor(min(col_lt, col_rb))) - pad, 0)
    row0 = max(int(np.floor(min(row_lt, row_rb))) - pad, 0)
    col1 = min(int(np.ceil(max(col_lt, col_rb))) + pad, width)
    row1 = min(int(np.ceil(max(row_lt, row_rb))) + pad, height)
    if col1 <= col0 or row1 <= row0:
        col0, row0, col1, row1 = 0, 0, 1, 1
    return Window(col0, row0, col1 - col0, row1 - row0)


def _tile_xy_range(
    mercator_bounds: tuple[float, float, float, float], z: int
) -> list[tuple[int, int]]:
    """Every (x, y) XYZ tile index at zoom z intersecting Web Mercator bounds."""
    n = 2 ** z
    half = _WORLD_M / 2.0
    res = _WORLD_M / n
    l = min(max(mercator_bounds[0], -half), half - 1e-9)
    b = min(max(mercator_bounds[1], -half), half - 1e-9)
    r = min(mercator_bounds[2], half - 1e-9)
    t = min(max(mercator_bounds[3], -half + 1e-9), half - 1e-9)
    x0 = max(int((l + half) // res), 0)
    x1 = min(int((r + half) // res), n - 1)
    y0 = max(int((half - t) // res), 0)
    y1 = min(int((half - b) // res), n - 1)
    if x1 < x0:
        x0 = x1 = 0
    if y1 < y0:
        y0 = y1 = 0
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def write_web_geotiff(
    zone_tif: Path,
    out_tif: Path,
    ranked_fallback: Sequence[str],
) -> Path:
    """Reproject a classified zone raster north-up onto EPSG:4326.

    Output keeps the single uint8 band, the source palette and the 255
    no-data transparency, and is written tiled and DEFLATE so the browser
    decoder reads only the blocks it needs for its window.
    """
    with rasterio.open(zone_tif) as src:
        classes = src.read(1)
        lut = _colour_lut(src, ranked_fallback)
        dst_transform, dst_w, dst_h = calculate_default_transform(
            src.crs, GEO_CRS, src.width, src.height, *src.bounds
        )
        north_up = _staged_reproject(
            classes, src.transform, src.crs, dst_transform, GEO_CRS, dst_w, dst_h
        )
    with rasterio.open(
        out_tif, "w", driver="COG",
        height=dst_h, width=dst_w, count=1, dtype="uint8",
        crs=GEO_CRS, nodata=255, compress="deflate", blocksize=512,
        transform=dst_transform,
    ) as dst:
        dst.write(north_up, 1)
        dst.write_colormap(
            1, {code: tuple(int(v) for v in lut[code]) for code in range(256)}
        )
    return out_tif


def write_zone_pmtiles(
    zone_tif: Path,
    out_pmtiles: Path,
    ranked_fallback: Sequence[str],
    name: str,
    min_zoom: int = MIN_ZOOM,
    max_zoom: int = MAX_ZOOM,
    transparent_codes: Sequence[int] = (),
) -> dict:
    """Cut a classified zone raster into a single-file raster PMTiles archive.

    The classes are warped once onto Web Mercator at the source's own ground
    resolution; each tile is then resampled nearest from only the pixel window
    it covers, coloured through the class lookup, and stored as PNG with
    transparent alpha wherever the ground was unobserved.

    `transparent_codes` clears classes that must leave the basemap visible. The
    source colour table cannot carry that: GDAL stores RGB only.

    Returns a small stats dict for the worker log.
    """
    with rasterio.open(zone_tif) as src:
        classes = src.read(1)
        lut = _colour_lut(src, ranked_fallback)
        for code in transparent_codes:
            if 0 <= int(code) <= 255:
                lut[int(code), 3] = 0
        src_transform, src_crs = src.transform, src.crs
        # One warp feeds every tile: low zooms read far fewer source pixels
        # than zone-raster pixels, so cutting from the Mercator copy beats
        # repeated per-tile UTM reprojections on the worker's 512 MB budget.
        merc_transform, merc_w, merc_h = calculate_default_transform(
            src.crs, WORLD_CRS, src.width, src.height, *src.bounds
        )

    classes_merc = _staged_reproject(
        classes, src_transform, src_crs, merc_transform, WORLD_CRS, merc_w, merc_h
    )
    merc_bounds = transform_bounds(src_crs, WORLD_CRS, *rasterio_open_bounds(zone_tif), densify_pts=21)
    lonlat_bounds = transform_bounds(src_crs, GEO_CRS, *rasterio_open_bounds(zone_tif), densify_pts=21)

    tiles: list[tuple[int, bytes]] = []
    for z in range(min_zoom, max_zoom + 1):
        res = _WORLD_M / (2 ** z)
        half = _WORLD_M / 2.0
        for x, y in _tile_xy_range(merc_bounds, z):
            tile_l = -half + x * res
            tile_r = tile_l + res
            tile_t = half - y * res
            tile_b = tile_t - res
            window = _window_px(
                merc_transform, tile_l, tile_t, tile_r, tile_b,
                merc_w, merc_h,
            )
            col0 = int(window.col_off)
            row0 = int(window.row_off)
            grey = _staged_reproject(
                classes_merc[row0: row0 + int(window.height), col0: col0 + int(window.width)],
                window_transform(window, merc_transform),
                WORLD_CRS,
                rasterio.transform.from_bounds(tile_l, tile_b, tile_r, tile_t, TILE, TILE),
                WORLD_CRS,
                TILE,
                TILE,
            )
            tiles.append(
                (zxy_to_tileid(z, x, y), _png_bytes(lut[grey, 0], lut[grey, 1], lut[grey, 2], lut[grey, 3]))
            )

    # The writer marks an archive unclustered when tiles arrive out of order,
    # so sort by tile id up front: a pan then reads each directory group in
    # close to the order the browser asks for them.
    tiles.sort(key=lambda entry: entry[0])
    head_l, head_b, head_r, head_t = lonlat_bounds
    tmp_path = out_pmtiles.with_suffix(".pmtiles.tmp")
    with pmtiles_write(tmp_path) as writer:
        for tileid, data in tiles:
            writer.write_tile(tileid, data)
        header = {
            "min_zoom": int(min_zoom),
            "max_zoom": int(max_zoom),
            "min_lon_e7": int(head_l * 1e7),
            "min_lat_e7": int(head_b * 1e7),
            "max_lon_e7": int(head_r * 1e7),
            "max_lat_e7": int(head_t * 1e7),
            "tile_type": TileType.PNG,
            "tile_compression": Compression.NONE,
        }
        metadata = {
            "name": name,
            "format": "png",
            "type": "raster",
            "minzoom": min_zoom,
            "maxzoom": max_zoom,
            "bounds": [head_l, head_b, head_r, head_t],
            "center": [
                (head_l + head_r) / 2.0,
                (head_b + head_t) / 2.0,
                min_zoom,
            ],
            "attribution": "SiteSurveyor AI - classified from DE Africa satellite coverages",
        }
        writer.finalize(header, metadata)
    tmp_path.replace(out_pmtiles)
    return {"tiles": len(tiles), "bytes": out_pmtiles.stat().st_size, "zooms": [min_zoom, max_zoom]}


def rasterio_open_bounds(zone_tif: Path) -> tuple[float, float, float, float]:
    """(left, bottom, right, top) of a raster, because transform_bounds takes a flat value."""
    with rasterio.open(zone_tif) as src:
        return src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top


ZONE_TIF_BY_CATEGORY: dict[str, tuple[str, str]] = {
    "water": ("groundwater_potential_zones.tif", "Groundwater potential zones"),
    "minerals": ("mineral_commodity_zones.tif", "Dominant mineral system"),
    "soil": ("soil_capability_zones.tif", "Land capability and erosion zones"),
    "hazard": ("hazard_risk_zones.tif", "Composite hazard and safety zones"),
}


def build_survey_tiles(categories: Sequence[str]) -> list[str]:
    """Build both web deliverables for every requested category that wrote a
    zone raster.

    Existence is the only test: a category the survey skipped has no zone
    raster, and a run must not inherit tiles from a previous run still sitting
    in the shared outputs directory. One category failing is logged and
    skipped so that one broken map never costs a survey its other deliverables.
    """
    # Imported here so this module can be exercised without pulling the full
    # classification stack into utilities that only need its class domain.
    from src.utils.classification import ZONE_PALETTES, ZONE_TRANSPARENT_CODES

    built: list[str] = []
    for category in categories:
        entry = ZONE_TIF_BY_CATEGORY.get(category)
        if entry is None:
            continue
        zone_name, display = entry
        zone_tif = cfg.OUT / zone_name
        if not zone_tif.is_file():
            continue
        palette = ZONE_PALETTES[category]
        clear = ZONE_TRANSPARENT_CODES.get(category, ())
        web_out = zone_tif.with_name(zone_tif.stem + "_web.tif")
        tiles_out = zone_tif.with_name(zone_tif.stem + "_tiles.pmtiles")
        for out_path, render in (
            (web_out, lambda p=web_out: write_web_geotiff(zone_tif, p, palette)),
            (tiles_out, lambda p=tiles_out: write_zone_pmtiles(zone_tif, p, palette, display,
                                                              transparent_codes=clear)),
        ):
            try:
                render()
                built.append(out_path.name)
            except Exception as exc:  # noqa: BLE001 - one map must not kill a run
                logger.warning(
                    "web map deliverable %s skipped for %s: %s",
                    out_path.name, zone_tif.name, exc,
                )
    return built
