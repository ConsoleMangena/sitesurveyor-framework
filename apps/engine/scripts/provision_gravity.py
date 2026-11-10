"""
Provision a SYNTHETIC Bouguer gravity calibration field for Southern Africa.

This writes an analytic model, not geophysical data. Nothing here is downloaded from
EIGEN-6C4, WGM2012 or the Geological Survey of Zimbabwe, and no amplitude below is an
observed value: they are plausible shapes chosen so the gravimetric pipeline has
something to run against before a real survey grid is provisioned.

The field covers Lat -24.0 to -15.0, Lon 25.0 to 34.0 at ~2.2 km posting and combines:

- A cratonic background tilt around -112 mGal.
- A Great Dyke-shaped linear ridge, +45 mGal with an ~8 km Gaussian half-width.
- Greenstone-belt-shaped highs over the Midlands, Kwekwe-Gweru, Masvingo and
  Harare-Bindura corridors.
- A granite-batholith-shaped low over Chilimanzi.

The raster is tagged `SITESURVEYOR_KIND=modelled` so `src/utils/gravity.py` reports it
as a model and withholds it from scoring. To score gravimetry, replace this file with a
real Bouguer grid tagged `measured` and carrying its citation.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root in sys.path and config imported first
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import src.config as cfg

import numpy as np
import rasterio
from rasterio.transform import from_origin

from src.utils.gravity import KIND_MODELLED, TAG_CITATION, TAG_KIND

CITATION = (
    "SiteSurveyor synthetic Bouguer calibration field (scripts/provision_gravity.py); "
    "analytic model, not a measured survey"
)


def generate_regional_bouguer_raster(
    out_path: Path | None = None,
    lat_range: tuple[float, float] = (-24.0, -15.0),
    lon_range: tuple[float, float] = (25.0, 34.0),
    step: float = 0.02,  # ~2.2 km resolution (matches 2 arc-min WGM2012)
) -> Path:
    if out_path is None:
        out_path = cfg.EXTERNAL / "bouguer_gravity.tif"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lat_min, lat_max = lat_range
    lon_min, lon_max = lon_range

    lats = np.arange(lat_max, lat_min - step / 2, -step, dtype="float64")
    lons = np.arange(lon_min, lon_max + step / 2, step, dtype="float64")

    h = len(lats)
    w = len(lons)

    # Grid coordinates
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    # 1. Regional isostatic background (-105 to -125 mGal across the Kalahari/Zimbabwe craton)
    # Long-wavelength tilt: slightly deeper in the south-west
    regional = -112.0 + 0.8 * (lat_grid - (-19.5)) - 0.5 * (lon_grid - 29.5)

    # 2. Great Dyke of Zimbabwe (NNE-trending ultramafic layered intrusion)
    # Runs from approximately (-20.8, 29.9) to (-16.5, 31.0)
    # Line equation: (lat - lat0) = m * (lon - lon0)
    p1 = np.array([-20.8, 29.9])
    p2 = np.array([-16.5, 31.0])
    line_vec = p2 - p1
    line_len_sq = np.dot(line_vec, line_vec)

    # Distance of each grid cell to Great Dyke line segment
    pt_vec_lat = lat_grid - p1[0]
    pt_vec_lon = lon_grid - p1[1]
    t = (pt_vec_lat * line_vec[0] + pt_vec_lon * line_vec[1]) / line_len_sq
    t = np.clip(t, 0.0, 1.0)
    proj_lat = p1[0] + t * line_vec[0]
    proj_lon = p1[1] + t * line_vec[1]
    dist_dyke_deg = np.hypot(lat_grid - proj_lat, lon_grid - proj_lon)
    dist_dyke_km = dist_dyke_deg * 111.0

    # Dyke anomaly: +45 mGal Gaussian ridge with ~8 km half-width
    dyke_anomaly = 45.0 * np.exp(-0.5 * (dist_dyke_km / 8.0) ** 2)

    # 3. Greenstone belt anomalies (dense mafic volcanics, BIFs, chromite complexes)
    # Shurugwi / Midlands ultramafic complex (-19.67, 30.00)
    shurugwi_km = np.hypot(lat_grid - (-19.67), lon_grid - 30.00) * 111.0
    shurugwi_anom = 26.0 * np.exp(-0.5 * (shurugwi_km / 12.0) ** 2)

    # Kwekwe-Gweru auriferous shear zone (-19.10, 29.80)
    kwekwe_km = np.hypot(lat_grid - (-19.10), lon_grid - 29.80) * 111.0
    kwekwe_anom = 18.0 * np.exp(-0.5 * (kwekwe_km / 16.0) ** 2)

    # Masvingo greenstone belt (-20.05, 30.85)
    masvingo_km = np.hypot(lat_grid - (-20.05), lon_grid - 30.85) * 111.0
    masvingo_anom = 22.0 * np.exp(-0.5 * (masvingo_km / 14.0) ** 2)

    # Harare-Bindura greenstone belt (-17.60, 31.10)
    harare_km = np.hypot(lat_grid - (-17.60), lon_grid - 31.10) * 111.0
    harare_anom = 20.0 * np.exp(-0.5 * (harare_km / 18.0) ** 2)

    # 4. Granite pluton gravity lows (-12 to -18 mGal)
    # Chilimanzi granite batholith (-19.45, 30.65)
    chilimanzi_km = np.hypot(lat_grid - (-19.45), lon_grid - 30.65) * 111.0
    chilimanzi_low = -16.0 * np.exp(-0.5 * (chilimanzi_km / 15.0) ** 2)

    # Composite Bouguer gravity field (mGal)
    bouguer = (
        regional
        + dyke_anomaly
        + shurugwi_anom
        + kwekwe_anom
        + masvingo_anom
        + harare_anom
        + chilimanzi_low
    ).astype("float32")

    # Affine transform for EPSG:4326 GeoTIFF
    transform = from_origin(lon_min, lat_max, step, step)

    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=-9999.0,
    ) as dst:
        dst.write(bouguer, 1)
        dst.set_band_description(1, "Bouguer Gravity Anomaly (mGal) - synthetic calibration field")
        dst.update_tags(**{
            TAG_KIND: KIND_MODELLED,
            TAG_CITATION: CITATION,
        })

    print(f"[ok] Provisioned SYNTHETIC Bouguer calibration field: {out_path} ({w}x{h}, {out_path.stat().st_size / 1024:.1f} KB)")
    print(f"     Lat range: [{lat_min}, {lat_max}] | Lon range: [{lon_min}, {lon_max}]")
    print(f"     Anomaly range: {float(np.nanmin(bouguer)):.1f} to {float(np.nanmax(bouguer)):.1f} mGal")
    print(f"     Tagged {TAG_KIND}={KIND_MODELLED} - reported as a model and withheld from scoring.")
    return out_path


if __name__ == "__main__":
    generate_regional_bouguer_raster()
