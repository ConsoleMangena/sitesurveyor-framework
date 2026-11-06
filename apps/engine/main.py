"""
SiteSurveyor AI — Unified CLI Runner
=====================================
Automated multi-criteria satellite screening platform for groundwater,
mineral, and soil-land capability intelligence.

Usage:
    python main.py --fetch                 # Fetch required DE Africa layers
    python main.py --category water        # Run Category 1: Groundwater potential
    python main.py --category minerals     # Run Category 2: Mineral prospectivity
    python main.py --category soil         # Run Category 3: Soil & Land capability
    python main.py --category all          # Run ALL categories
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure src can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent))

import src.config as cfg


def check_data_present() -> bool:
    """Check if minimum required satellite layers exist in active AOI raw data dir."""
    required = ["dem.tif", "landcover.tif", "alos.tif", "optical.tif", "wofs.tif", "rain_mean.tif"]
    missing = [f for f in required if not (cfg.RAW / f).exists()]
    return len(missing) == 0


def main():
    parser = argparse.ArgumentParser(
        description="SiteSurveyor AI — Multi-Criteria Satellite Screening Platform (Eineva Labs)"
    )
    parser.add_argument(
        "--lat",
        type=float,
        default=None,
        help="Target latitude in decimal degrees (e.g. -19.50487)",
    )
    parser.add_argument(
        "--lon",
        type=float,
        default=None,
        help="Target longitude in decimal degrees (e.g. 29.84598)",
    )
    parser.add_argument(
        "--half-deg",
        type=float,
        default=0.12,
        help="AOI radius buffer in degrees around target (default: 0.12 deg ~ 13.3 km)",
    )
    parser.add_argument(
        "--client",
        type=str,
        default=None,
        help="Client or project name for report attribution",
    )
    parser.add_argument(
        "--address",
        type=str,
        default=None,
        help="Property address or geographical location description",
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Fetch satellite data layers from Digital Earth Africa WCS",
    )
    parser.add_argument(
        "--category",
        choices=["water", "minerals", "soil", "hazard", "all", "none"],
        default="all",
        help="Analysis domain category to execute (default: all)",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Generate the executive multi-category JSON dossier from existing survey outputs",
    )
    parser.add_argument(
        "--force-fetch",
        action="store_true",
        help="Force redownload of satellite data even if cached",
    )

    args = parser.parse_args()

    # Parameterize target site dynamically if specified
    if args.lat is not None and args.lon is not None:
        cfg.set_target_site(
            args.lat,
            args.lon,
            half_deg=args.half_deg,
            client=args.client,
            address=args.address,
        )
    elif args.client or args.address:
        if args.client:
            cfg.CLIENT = args.client
        if args.address:
            cfg.CLIENT_ADDRESS = args.address

    if args.report and "--category" not in sys.argv:
        args.category = "none"

    print("=" * 70)
    print("   SiteSurveyor AI — Satellite Screening & Site Intelligence")
    print(f"   Client:   {cfg.CLIENT} ({cfg.CLIENT_ADDRESS})")
    print(f"   Target:   Latitude {cfg.TARGET_LAT:.5f}°, Longitude {cfg.TARGET_LON:.5f}°")
    print(f"   CRS/UTM:  WGS 84 / UTM Zone {cfg.UTM_ZONE} (EPSG:{cfg.EPSG})")
    print(f"   AOI Dir:  {cfg.RAW}")
    print("=" * 70)

    # 1. Fetch data if requested or if missing
    if args.fetch or args.force_fetch or not check_data_present():
        print("\n[STEP 1] Data Acquisition from Digital Earth Africa WCS...")
        from src.fetch_data import fetch_all
        fetch_all(force=args.force_fetch)
    else:
        print(f"\n[INFO] Satellite data already cached in {cfg.RAW}. Proceeding to analysis.")

    # 2. Run Category 1: WATER
    if args.category in ("water", "all"):
        print("\n" + "#" * 70)
        print("  CATEGORY 1: WATER — Groundwater Potential & Precision Siting")
        print("#" * 70 + "\n")
        from src.engines.water import run_water_survey
        run_water_survey()

    # 3. Run Category 2: MINERALS
    if args.category in ("minerals", "all"):
        print("\n" + "#" * 70)
        print("  CATEGORY 2: MINERALS — Shear-Zone Gold Prospectivity Screening")
        print("#" * 70 + "\n")
        from src.engines.minerals import run_minerals_survey
        run_minerals_survey()

    # 4. Run Category 3: SOIL & LAND
    if args.category in ("soil", "all"):
        print("\n" + "#" * 70)
        print("  CATEGORY 3: SOIL & LAND — Land Capability & Erosion Risk")
        print("#" * 70 + "\n")
        from src.engines.soil import run_soil_survey
        run_soil_survey()

    # 5. Run Category 5: HAZARD & RISK
    if args.category in ("hazard", "all"):
        print("\n" + "#" * 70)
        print("  CATEGORY 5: HAZARD & RISK — Multi-Hazard Screening & Safety Siting")
        print("#" * 70 + "\n")
        from src.engines.hazard import run_hazard_survey
        run_hazard_survey()

    # 6. Generate Executive Multi-Category Dossier
    if args.report or args.category == "all":
        print("\n" + "#" * 70)
        print("  EXECUTIVE SYNTHESIS — Generating Master Site Intelligence Dossier")
        print("#" * 70 + "\n")
        from src.report import generate_site_dossier
        generate_site_dossier()

    print("\n" + "=" * 70)
    print("   ALL REQUESTED SURVEYS COMPLETED.")
    print(f"   Inspect output maps, GeoTIFFs, and GeoJSON vectors in: {cfg.OUT}")
    print("=" * 70)


if __name__ == "__main__":
    main()

