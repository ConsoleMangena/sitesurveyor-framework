"""
SiteSurveyor AI — Data Acquisition Engine
==========================================
Fetch satellite Earth observation layers from Digital Earth Africa's
open OGC Web Coverage Service (WCS 2.1.0) using personal access token authentication.
Supports dynamic bounding box and target coordinate context.
"""
from __future__ import annotations

import calendar
import os
import sys
import time as _time
import warnings
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Import config FIRST to ensure PROJ_LIB and PROJ_DATA are configured before rasterio
import src.config as cfg

import numpy as np
import rasterio
import requests
from pyproj import Transformer
from rasterio.warp import Resampling

from src.utils.raster import warp

# The five wavelengths every engine reads, asked for by name on every optical product in the
# registry, so a Sentinel-2/Landsat swap cannot renumber them underneath an index.
OPTICAL_BANDS = ("blue", "red", "nir", "swir_1", "swir_2")
# Sen2Cor scene classification: 4 vegetation, 5 bare soil, 6 water are the classes that
# describe the ground. 1/2/3/8/9/10 are cloud, shadow, haze and cirrus, and a median taken
# over them is a median of cloud tops with a confident score printed on it.
CLEAR_SCL = (4, 5, 6)
COMPOSITE_SCENES = 4          # enough to average out haze, cheap enough for the 512 MB tier
MAX_SCENE_ATTEMPTS = 12       # a wet season may need many tries before four clear scenes
MIN_CLEAR_FRACTION = 0.25     # a scene cloudier than this adds more cloud than evidence


def _xy_bbox(bbox: tuple[float, float, float, float], target_crs: str = "EPSG:6933") -> tuple[float, float, float, float]:
    """Convert WGS84 bbox (minx, miny, maxx, maxy) to target CRS."""
    if target_crs == "EPSG:6933":
        transformer = cfg.TO_6933
    elif target_crs == str(cfg.LOCAL_CRS) or target_crs == f"EPSG:{cfg.LOCAL_CRS.to_epsg() if cfg.LOCAL_CRS else 32735}":
        transformer = cfg.TO_LOCAL
    else:
        transformer = Transformer.from_crs("EPSG:4326", target_crs, always_xy=True)

    xs, ys = transformer.transform(
        [bbox[0], bbox[2], bbox[2], bbox[0]],
        [bbox[1], bbox[1], bbox[3], bbox[3]],
    )
    return min(xs), min(ys), max(xs), max(ys)


def _url(coverage: str, bbox: tuple[float, float, float, float], stamp: str | None = None,
         projected: bool = False, target_crs: str = "EPSG:6933",
         bands: list[str] | tuple[str, ...] | None = None) -> str:
    """Build WCS GetCoverage request URL."""
    params = [
        "service=WCS",
        "version=2.1.0",
        "request=GetCoverage",
        f"coverageid={coverage}",
    ]
    if projected:
        x0, y0, x1, y1 = _xy_bbox(bbox, target_crs)
        params += [f"subset=x({x0:.0f},{x1:.0f})", f"subset=y({y0:.0f},{y1:.0f})"]
    else:
        params += [
            f"subset=Lat({bbox[1]:.6f},{bbox[3]:.6f})",
            f"subset=Long({bbox[0]:.6f},{bbox[2]:.6f})",
        ]
    if stamp:
        params.append(f'subset=time(%22{stamp}%22)')
    if bands:
        # Asking for the bands by name is the whole point: the response order follows the
        # request, so a product with a different band layout cannot slide a different
        # wavelength into the vegetation maths. It also cuts a 14-band mosaic to 5 bands.
        from urllib.parse import quote
        params.append(f"rangesubset={quote(','.join(bands))}")
    params.append("format=image/geotiff")
    return f"{cfg.WCS_URL}?{'&'.join(params)}"


CHUNK_BYTES = 1 << 20


def _download(url: str, out: Path, retries: int = 4, optional: bool = False) -> bool:
    """Download raster with retry logic and GeoTIFF header validation.

    The body is streamed to a part file rather than read into `r.content`: a 14-band
    annual mosaic is hundreds of megabytes, and buffering it alongside the analysis that
    follows is what pushed the instance over its memory limit during a cold fetch.
    """
    tmp = out.with_name(f"{out.stem}.part")
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, headers=cfg.HEADERS, timeout=300, stream=True) as r:
                if r.status_code != 200:
                    tmp.unlink(missing_ok=True)
                    if optional and r.status_code in (404, 400):
                        print(f"[skip] {out.stem}: no data in archive ({r.status_code})")
                        return False
                    print(f"[retry {attempt}] {out.stem}: HTTP {r.status_code}")
                else:
                    with open(tmp, "wb") as fh:
                        for chunk in r.iter_content(chunk_size=CHUNK_BYTES):
                            fh.write(chunk)
                    with open(tmp, "rb") as fh:
                        magic = fh.read(2)
                        size = tmp.stat().st_size
                        head = fh.read(120) if size <= 4 or magic not in (b"II", b"MM") else b""
                    if size <= 4 or magic not in (b"II", b"MM"):
                        tmp.unlink(missing_ok=True)
                        print(f"[retry {attempt}] {out.stem}: not a GeoTIFF: {head!r}")
                    else:
                        os.replace(tmp, out)
                        with rasterio.open(out) as ds:
                            print(f"[ok] {out.stem:12s} {ds.count:2d} band(s)  "
                                  f"{ds.width}x{ds.height}  {ds.crs}")
                        return True
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            print(f"[retry {attempt}] {out.stem}: {exc}")
        _time.sleep(2 * attempt)
    tmp.unlink(missing_ok=True)
    if optional:
        print(f"[skip] {out.stem}: unavailable after {retries} retries")
        return False
    raise RuntimeError(f"Could not download {out.stem} from {url}")


def fetch(name: str, coverage: str, stamp: str | None = None, projected: bool = False,
          target_crs: str = "EPSG:6933", retries: int = 4, optional: bool = False,
          cache: bool = True) -> Path | None:
    """
    Fetch a DE Africa layer via WCS with local caching in the active AOI directory.
    """
    out = cfg.RAW / f"{name}.tif"
    src = cfg.RAW / f"{name}.src"

    if cache and out.exists() and out.stat().st_size > 0:
        # The cache is keyed by layer name, so the sidecar is the only record of which
        # coverage produced it: without the match, switching the elevation model would
        # keep analysing the DEM downloaded for the previous one.
        cached_from = provenance(name)
        if cached_from != coverage:
            print(f"[cache] {name:12s} cached from '{cached_from or 'unknown'}', "
                  f"not '{coverage}' - re-fetching")
        else:
            try:
                with rasterio.open(out) as ds:
                    if ds.width > 0 and ds.height > 0:
                        print(f"[cache] {name:12s} ({out.stat().st_size / (1024*1024):.1f} MB)")
                        return out
            except Exception as exc:
                print(f"[cache] {name:12s} cached file unreadable, re-fetching: {type(exc).__name__}: {exc}")

    url = _url(coverage, cfg.BBOX_WGS84, stamp, projected, target_crs)
    success = _download(url, out, retries, optional)
    if success:
        src.write_text(coverage, encoding="utf-8")
        return out
    return None


def provenance(name: str) -> str:
    """The coverageid the cached layer on disk was actually downloaded from."""
    detail = provenance_detail(name)
    if detail:
        return detail.split()[0]
    for spec in cfg.DATA_SOURCES.values():
        if spec["layer"] == name:
            return spec["default"]
    return ""


def provenance_detail(name: str) -> str:
    """The full sidecar record: coverage, and for the optical layer its year and window too."""
    src = cfg.RAW / f"{name}.src"
    if src.exists():
        try:
            return src.read_text(encoding="utf-8").strip()
        except OSError:
            return ""
    for spec in cfg.DATA_SOURCES.values():
        if spec["layer"] == name:
            return spec["default"]
    return ""


def _window_range(year: int, window: str) -> tuple[str, str]:
    """ISO interval for a composite window, crossing the new year when the season does.

    A southern wet season labelled 2023 is Nov-Dec 2023 plus Jan-Apr 2024; treating it as a
    single calendar year would quietly composite this side's dry months and call them wet.
    """
    months = cfg.composite_months(window)
    prev = 0
    offset = 0
    spans = []
    for month in months:
        if month < prev:
            offset += 1     # the wrap is sticky: every later month stays in the next year
        prev = month
        spans.append((year + offset, month))
    start = f"{spans[0][0]}-{spans[0][1]:02d}-01T00:00:00Z"
    y, m = spans[-1]
    end = f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}T23:59:59Z"
    return start, end


def _l2a_scenes(year: int, window: str) -> list[tuple[str, float]]:
    """Scene dates in the window, least cloudy first, from the STAC catalogue."""
    start, end = _window_range(year, window)
    payload = {
        "collections": ["s2_l2a"],
        "bbox": list(cfg.BBOX_WGS84),
        "datetime": f"{start}/{end}",
        "limit": 200,
        "fields": {"include": ["properties.datetime", "properties.eo:cloud_cover"], "exclude": []},
    }
    r = requests.post(cfg.STAC_URL, json=payload, timeout=90)
    r.raise_for_status()
    items = r.json().get("features", [])
    by_date: dict[str, float] = {}
    for item in items:
        props = item.get("properties", {})
        stamp = props.get("datetime") or ""
        if not stamp:
            continue
        cloud = props.get("eo:cloud_cover")
        cloud = float(cloud) if cloud is not None else 100.0
        # A date can return one item per intersecting tile, each with its own cloud figure;
        # keep the worst, since the whole AOI has to be clear, not just one tile of it.
        date = stamp[:10]
        by_date[date] = max(by_date.get(date, 0.0), cloud)
    return sorted(by_date.items(), key=lambda kv: kv[1])


def _composite_l2a(out: Path, sidecar: Path, wanted: str) -> Path | None:
    """Median of the clear pixels in up to COMPOSITE_SCENES L2A scenes of the chosen window.

    WCS serves L2A one instant at a time, so the composite is built here. Each scene is
    folded onto the analysis grid and deleted before the next is fetched: four 45 MB scenes
    held at once would be a memory problem on the 512 MB tier, four 3 MB grids are not.
    """
    year = int(cfg.ACTIVE_COMPOSITE["year"])
    window = str(cfg.ACTIVE_COMPOSITE["window"])
    scenes = _l2a_scenes(year, window)
    if not scenes:
        raise RuntimeError(
            f"The DE Africa catalogue lists no Sentinel-2 L2A scene over this site for "
            f"{window} {year}. Try the other season, another year, or the annual GeoMAD composite."
        )
    stacks: dict[str, list[np.ndarray]] = {b: [] for b in OPTICAL_BANDS}
    used: list[str] = []
    tmp = cfg.RAW / ".optical_scene.tif"

    for date, cloud in scenes[:MAX_SCENE_ATTEMPTS]:
        if len(used) >= COMPOSITE_SCENES:
            break
        url = _url("s2_l2a", cfg.BBOX_WGS84, f"{date}T00:00:00.000Z", projected=True,
                   bands=list(OPTICAL_BANDS) + ["mask"])
        if not _download(url, tmp, retries=1, optional=True):
            continue
        try:
            clear = np.isin(warp(tmp, "mask", resampling=Resampling.nearest), CLEAR_SCL)
            fraction = float(clear.mean())
            if fraction < MIN_CLEAR_FRACTION:
                print(f"[composite] {date}: only {fraction:.0%} clear ground, not using it")
                continue
            for band in OPTICAL_BANDS:
                a = warp(tmp, band)
                a[~clear] = np.nan
                stacks[band].append(a)
            used.append(date)
            print(f"[composite] {date}: {fraction:.0%} clear ground, scene {len(used)}")
        finally:
            tmp.unlink(missing_ok=True)

    if not used:
        raise RuntimeError(
            f"No usable Sentinel-2 L2A scene for {window} {year}: the dates in that window "
            "either have no coverage or were mostly cloud. Try the other season, another "
            "year, or the annual GeoMAD composite."
        )

    bands = []
    for band in OPTICAL_BANDS:
        stack = np.stack(stacks[band])
        del stacks[band]
        # A cell no clear scene covers is this AOI's nodata, which nanmedian reports as an
        # all-NaN slice; the warning would bury the fetch log under cells that are meant to be empty.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            a = np.nanmedian(stack, axis=0).astype("float32")
        bands.append(np.nan_to_num(a, nan=0.0))

    with rasterio.open(
        out, "w", driver="GTiff", height=cfg.HEIGHT, width=cfg.WIDTH,
        count=len(OPTICAL_BANDS), dtype="float32", crs=cfg.LOCAL_CRS,
        transform=cfg.TRANSFORM, nodata=0.0,
    ) as dst:
        for i, band in enumerate(OPTICAL_BANDS, start=1):
            dst.write(bands[i - 1], i)
            dst.set_band_description(i, band)
    sidecar.write_text(wanted, encoding="utf-8")
    (cfg.RAW / "optical.scenes").write_text(
        "\n".join(used) + "\n", encoding="utf-8"
    )
    print(f"[ok] optical      median of {len(used)} clear scenes ({', '.join(used)}), "
          f"{len(OPTICAL_BANDS)} named bands")
    return out


def fetch_optical(cache: bool = True) -> Path | None:
    """Fetch the optical layer this run selected, as five named bands on one file.

    GeoMAD comes down as-is; L2A is composited over the selected window. Both leave the
    same file contract behind, so no engine needs to know which one produced it.
    """
    out = cfg.RAW / "optical.tif"
    sidecar = cfg.RAW / "optical.src"
    wanted = cfg.composite_signature()

    if cache and out.exists() and out.stat().st_size > 0:
        if provenance_detail("optical") != wanted:
            print(f"[cache] optical      cached from '{provenance_detail('optical')}', "
                  f"not '{wanted}' - re-fetching")
        else:
            with rasterio.open(out) as ds:
                if ds.width > 0 and set(OPTICAL_BANDS).issubset(set(ds.descriptions or ())):
                    print(f"[cache] optical      {cfg.composite_label(wanted)} "
                          f"({out.stat().st_size / (1024 * 1024):.1f} MB)")
                    return out
            print("[cache] optical      file unreadable or missing named bands, re-fetching")

    if cfg.ACTIVE_SOURCES["optical"] == "s2_l2a":
        return _composite_l2a(out, sidecar, wanted)

    # Every other optical source in the registry is a GeoMAD mosaic: one median per year, the
    # same five band names, the same scaling, so one code path serves Sentinel-2 and Landsat.
    coverage = cfg.ACTIVE_SOURCES["optical"]
    stamp = f"{cfg.ACTIVE_COMPOSITE['year']}-01-01T00:00:00.000Z"
    url = _url(coverage, cfg.BBOX_WGS84, stamp, projected=True, bands=list(OPTICAL_BANDS))
    if _download(url, out):
        sidecar.write_text(wanted, encoding="utf-8")
        (cfg.RAW / "optical.scenes").write_text("", encoding="utf-8")
        return out
    return None


def scenes_used() -> list[str]:
    """The L2A scene dates the current optical composite was built from, if any."""
    p = cfg.RAW / "optical.scenes"
    try:
        return [line.strip() for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
    except OSError:
        return []



def used_sources() -> dict:
    """Name the coverages the rasters on disk came from, for anywhere that discloses inputs.

    The sidecars are the authority rather than ``cfg.ACTIVE_SOURCES``: a report that named the
    coverage the caller asked for instead of the one the numbers were actually computed from
    would be a false attribution, and the two differ whenever a cached layer predates a switch.
    """
    selectable = {}
    for key, spec in cfg.DATA_SOURCES.items():
        coverage = provenance(spec["layer"]) or cfg.ACTIVE_SOURCES[key]
        label = spec["options"].get(coverage, coverage)
        if key == "optical":
            detail = provenance_detail("optical")
            if len(detail.split()) == 3:
                label = cfg.composite_label(detail)
        entry = {"coverage": coverage, "label": label}
        if key == "optical":
            # The agency behind the pixels, carried with the entry so a dossier credits Landsat
            # for a Landsat median instead of assuming Copernicus produced every optical run.
            entry["credit"] = cfg.optical_credit(coverage)
            scenes = scenes_used()
            if scenes:
                entry["scenes"] = scenes
        selectable[key] = entry
    return {"selectable": selectable, "fixed": dict(cfg.FIXED_SOURCES)}


def stale_layers() -> list[str]:
    """Selectable layers this AOI holds from a coverage other than the one selected."""
    stale = []
    for key, spec in cfg.DATA_SOURCES.items():
        name = spec["layer"]
        if not (cfg.RAW / f"{name}.tif").exists():
            continue
        # Optical has to match the window as well as the product: a 2023 annual median and a
        # 2024 dry season are both "Sentinel-2" and both perfectly valid, just not for this run.
        if key == "optical":
            if provenance_detail(name) != cfg.composite_signature():
                stale.append(name)
        elif provenance(name) != cfg.ACTIVE_SOURCES[key]:
            stale.append(name)
    return stale


def ensure_raw(required: list[str]) -> None:
    """Fetch what this AOI is missing, and what it holds from the wrong coverage.

    The engines used to gate on the files merely existing, so a survey that switched elevation
    model re-scored the previous coverage while its report credited the new one. A selection
    nobody checks against the cache is a selection that silently does nothing.
    """
    stale = stale_layers()
    missing = [name for name in required if not (cfg.RAW / name).exists()]
    if not stale and not missing:
        return
    if stale:
        print(f"[sources] {', '.join(stale)} cached from another coverage than the one selected; "
              "refetching")
    want = sorted({name[: -len(".tif")].replace("_mean", "") for name in missing} | set(stale))
    fetch_all(layers=want)


def fetch_all(
    target_lat: float | None = None,
    target_lon: float | None = None,
    half_deg: float = 0.12,
    client: str | None = None,
    address: str | None = None,
    force: bool = False,
    layers: list[str] | None = None,
) -> dict[str, Path | None]:
    """Fetch baseline layers required for analysis engines, optionally filtering by layer names."""
    if target_lat is not None and target_lon is not None:
        cfg.set_target_site(target_lat, target_lon, half_deg, client, address)

    print("=" * 60)
    print(f"SiteSurveyor AI — Data Acquisition [{cfg.AOI_SLUG}]")
    print(f"Center:    Lat {cfg.TARGET_LAT:.5f}, Lon {cfg.TARGET_LON:.5f}")
    print(f"BBOX:      {cfg.BBOX_WGS84}")
    print(f"Local CRS: {cfg.LOCAL_CRS}")
    print(f"API Key:   {cfg.API_KEY[:8]}..." if cfg.API_KEY else "API Key: NOT SET")
    print("=" * 60)

    use_cache = not force
    results: dict[str, Path | None] = {}
    want = set(layers) if layers else None

    # 1. Elevation model (selectable: Copernicus DEM, SRTM, NASA DEM)
    if want is None or "dem" in want:
        results["dem"] = fetch("dem", cfg.ACTIVE_SOURCES["dem"], cache=use_cache)

    # 2. Land cover map (selectable: ESA WorldCover 2021 / 2020, 10 m)
    if want is None or "landcover" in want:
        results["landcover"] = fetch("landcover", cfg.ACTIVE_SOURCES["landcover"], cache=use_cache)

    # 3. ALOS PALSAR 2007 L-Band SAR Mosaic
    if want is None or "alos" in want:
        results["alos"] = fetch("alos", "alos_palsar_mosaic", "2007-01-01T00:00:00.000Z", cache=use_cache)

    # 4. Landsat WOfS (Water Observations from Space)
    if want is None or "wofs" in want:
        results["wofs"] = fetch("wofs", "wofs_ls_summary_alltime", projected=True, cache=use_cache)

    # 5. Optical surface reflectance (selectable: a Sentinel-2 or Landsat annual GeoMAD median,
    #    or a Sentinel-2 L2A composite of clear scenes over the chosen year and season)
    if want is None or "optical" in want or "geomad" in want:
        results["optical"] = fetch_optical(cache=use_cache)

    # 6. CHIRPS Monthly Rainfall (2023-2024 sample)
    if want is None or "rain" in want or "rain_mean" in want:
        months = [(y, m) for y in (2023, 2024) for m in range(1, 13)]
        cube, transform, crs = [], None, None
        unreadable_months = []
        for y, m in months:
            f = fetch(f"rain_{y}{m:02d}", "rainfall_chirps_monthly",
                      f"{y}-{m:02d}-01T00:00:00.000Z", optional=True,
                      target_crs="EPSG:4326", projected=False, cache=use_cache)
            if f is not None and f.exists():
                try:
                    with rasterio.open(f) as ds:
                        cube.append(ds.read(1).astype("float32"))
                        transform, crs = ds.transform, ds.crs
                except Exception as exc:
                    unreadable_months.append(f"{y}-{m:02d} ({type(exc).__name__})")
        if unreadable_months:
            print(f"[warn] {len(unreadable_months)} downloaded month(s) could not be read and are "
                  f"excluded from the rainfall mean: {', '.join(unreadable_months)}")

        rain_mean_path = cfg.RAW / "rain_mean.tif"
        if cube and (force or not rain_mean_path.exists()):
            arr = np.nanmean(np.stack(cube), axis=0)
            with rasterio.open(
                rain_mean_path, "w", driver="GTiff",
                height=arr.shape[0], width=arr.shape[1], count=1,
                dtype="float32", crs=crs, transform=transform,
                nodata=np.nan,
            ) as dst:
                dst.write(arr, 1)
            print(f"[ok] rain_mean   Aggregated {len(cube)} months; ~{np.nanmean(arr) * 12:.0f} mm/yr")
        elif rain_mean_path.exists():
            print("[cache] rain_mean")

        results["rain_mean"] = rain_mean_path if rain_mean_path.exists() else None

    # 7. DE Africa Continental Cropland Extent (10m - African Agriculture Model)
    if want is None or "crop_mask" in want:
        results["crop_mask"] = fetch(
            "crop_mask", "crop_mask", "2019-01-01T00:00:00.000Z",
            projected=True, optional=True, cache=use_cache
        )

    # 8. DE Africa Fractional Cover Annual Summary (Landsat 30m - BS / PV / NPV)
    if want is None or "fc_ls" in want or "fc_ls_2023" in want:
        results["fc_ls"] = fetch(
            "fc_ls_2023", "fc_ls_summary_annual", "2023-01-01T00:00:00.000Z",
            projected=True, optional=True, cache=use_cache
        )

    return results

    return results


if __name__ == "__main__":
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    fetch_all()
