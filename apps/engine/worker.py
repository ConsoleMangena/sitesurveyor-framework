"""
SiteSurveyor AI -- survey job worker
====================================

The engine's second entry point, and the one the platform actually uses.

A survey no longer arrives as an HTTP request from a browser that has to stay open. It
arrives as a row in `survey_runs`, written by the `satellite-survey` edge function after
that function charged the workspace's credits. This process claims the row, runs the same
raster pipeline it always ran, and publishes what came out -- scores, ranked targets, and
the maps and KMZ files uploaded into Supabase Storage -- back onto the row.

Why a worker rather than an HTTP endpoint:
  * a survey outlives the tab that started it, and its files outlive this container,
    because the platform holds both instead of this process;
  * every run is attributable to a user and a workspace, which an unauthenticated POST
    to a public endpoint is not;
  * nothing here listens on a port, so there is no browser origin to allowlist and no
    public endpoint that will happily burn the coverage quota for whoever finds it.

One survey at a time, on purpose. The engines read the active AOI out of the module
globals in `src.config`, so two concurrent runs would each analyse the other's area and
publish plausible numbers for the wrong place. To raise throughput, replace those globals
with an immutable per-job context -- do not run several of these.

Environment:
  SUPABASE_URL                 project URL, e.g. https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    (or SUPABASE_SECRET_KEY) the privileged key
  SITESURVEYOR_STATE_DIR       persistent disk: coverage cache + rendered outputs
  DEAFRICA_SANDBOX_API_KEY     coverage access
  SURVEY_POLL_SECONDS          idle wait between claim attempts (default 10)
"""
from __future__ import annotations

import logging
import os
import signal
import socket
import sys
import time
from pathlib import Path

import requests

from src import config as cfg
from src.mcp.server import _single_site, set_progress_callback, survey_site
from src.utils import webtiles

logger = logging.getLogger("sitesurveyor.worker")

BUCKET = os.getenv("SURVEY_DELIVERABLES_BUCKET", "survey-deliverables")
POLL_SECONDS = float(os.getenv("SURVEY_POLL_SECONDS", "10"))
WORKER_ID = os.getenv("WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}"

# What a finished survey leaves on disk, keyed exactly as the label table in
# apps/web/src/lib/surveys/labels.ts so the words the app prints for a `soil_map` name
# the file this process actually wrote.
# The on-demand HTML reports and raster viewers are absent on purpose: they are written
# when someone asks for them, never by a survey, so publishing them here would advertise
# downloads that do not exist.
SURVEY_DELIVERABLES: dict[str, str] = {
    "master_json_dossier": "master_site_dossier.json",
    "mineral_commodities_json": "mineral_commodities.json",
    "mineral_commodities_csv": "mineral_commodities.csv",
    "boreholes_kmz": "candidate_borehole_sites.kmz",
    "minerals_kmz": "candidate_mineral_targets.kmz",
    "soil_kmz": "candidate_land_zones.kmz",
    "safest_sites_kmz": "safest_buildable_sites.kmz",
    "groundwater_map": "groundwater_potential_map.png",
    "minerals_map": "mineral_prospectivity_map.png",
    "soil_map": "soil_capability_map.png",
    "hazard_map": "hazard_risk_map.png",
    "boreholes_geojson": "candidate_borehole_sites.geojson",
    "minerals_geojson": "candidate_mineral_targets.geojson",
    "soil_geojson": "candidate_land_zones.geojson",
    "safest_sites_geojson": "safest_buildable_sites.geojson",
    "groundwater_tif": "groundwater_potential_zones.tif",
    "minerals_tif": "mineral_commodity_zones.tif",
    "soil_tif": "soil_capability_zones.tif",
    "hazard_tif": "hazard_risk_zones.tif",
    "groundwater_index_tif": "gwpz_index.tif",
    "minerals_index_tif": "mineral_commodity_index.tif",
    "soil_index_tif": "soil_capability_index.tif",
    "hazard_index_tif": "hazard_composite_index.tif",
    "gravity_zones_tif": "gravity_density_zones.tif",
    "gravity_residual_tif": "gravity_residual_anomaly.tif",
    "groundwater_overlay": "groundwater_overlay.png",
    "minerals_overlay": "minerals_overlay.png",
    "soil_overlay": "soil_overlay.png",
    "hazard_overlay": "hazard_overlay.png",
    # Web-map deliverables, built after the survey runs by src/utils/webtiles.py:
    # a north-up EPSG:4326 raster the browser drape sits exactly on, and a
    # single-file raster PMTiles archive the workbench map pans and zooms as
    # real tiles. Written the same way as everything above (existence is the
    # only test), so an older run without them simply offers no map layer.
    "groundwater_webtif": "groundwater_potential_zones_web.tif",
    "minerals_webtif": "mineral_commodity_zones_web.tif",
    "soil_webtif": "soil_capability_zones_web.tif",
    "hazard_webtif": "hazard_risk_zones_web.tif",
    "groundwater_tiles": "groundwater_potential_zones_tiles.pmtiles",
    "minerals_tiles": "mineral_commodity_zones_tiles.pmtiles",
    "soil_tiles": "soil_capability_zones_tiles.pmtiles",
    "hazard_tiles": "hazard_risk_zones_tiles.pmtiles",
    "gravity_webtif": "gravity_density_zones_web.tif",
    "gravity_tiles": "gravity_density_zones_tiles.pmtiles",
}

CONTENT_TYPES = {
    ".json": "application/json",
    ".geojson": "application/geo+json",
    ".kmz": "application/vnd.google-earth.kmz",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".csv": "text/csv",
    ".html": "text/html",
    # Single-file tile archives are served by the browser's PMTiles reader
    # over HTTP range requests; content type is informational only.
    ".pmtiles": "application/octet-stream",
}


class PlatformError(RuntimeError):
    pass


class Platform:
    """The four RPCs this process is allowed to call, plus object uploads.

    It authenticates with the service-role key, which is why the migration grants those
    functions to `service_role` and nothing else: the worker can move a survey job along
    and cannot read a single row of the schema around it.
    """

    def __init__(self, url: str, key: str, timeout: int = 120) -> None:
        self.session = requests.Session()
        self.session.headers.update({"apikey": key, "Authorization": f"Bearer {key}"})
        self.rest = f"{url.rstrip('/')}/rest/v1"
        self.storage = f"{url.rstrip('/')}/storage/v1/object/{BUCKET}"
        self.timeout = timeout

    def rpc(self, name: str, params: dict) -> object:
        response = self.session.post(
            f"{self.rest}/rpc/{name}", json=params, timeout=self.timeout
        )
        if not response.ok:
            raise PlatformError(f"{name}: {response.status_code} {response.text[:300]}")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def upload(self, path: str, body: bytes, content_type: str) -> None:
        response = self.session.post(
            f"{self.storage}/{path}",
            data=body,
            headers={
                "Content-Type": content_type,
                # A reclaimed job republishes the same object names; without upsert the
                # second attempt would 409 and fail a survey that had already succeeded.
                "x-upsert": "true",
            },
            timeout=self.timeout,
        )
        if not response.ok:
            raise PlatformError(
                f"upload {path}: {response.status_code} {response.text[:300]}"
            )


def first_env(*names: str) -> str:
    """The first of these environment variables that is set.

    Supabase has shipped the privileged key under two names across its tooling, and a
    deployment that picked the other one should start rather than exit at boot.
    """
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    raise SystemExit(
        f"None of {', '.join(names)} are set. The worker writes results into the platform "
        "database, so it needs the project URL and the service-role key to do so."
    )


def _number(value: object) -> float | None:
    """A JSON number, or None for anything else.

    Rows are published as they are scored, and a candidate missing a measurement must
    publish a NULL column rather than kill the write of every other target in the survey.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _metric(low: object, high: object, unit: str) -> str | None:
    lo, hi = _number(low), _number(high)
    if lo is None and hi is None:
        return None
    if lo is None:
        return f"{hi:g}{unit}"
    if hi is None:
        return f"{lo:g}{unit}"
    if lo == hi:
        return f"{lo:g}{unit}"
    return f"{lo:g}-{hi:g}{unit}"


def readout(category: str, row: dict) -> str | None:
    """The one line a crew acts on, worded per category.

    Deliberately not one generic rule: the same column name means a drilling depth in
    water and a stripped-cover thickness in minerals, and printing the wrong reading for
    a coordinate is worse than printing none.
    """
    parts: list[str] = []
    if category == "water":
        read = row.get("borehole_read")
        if read:
            parts.append(str(read))
        depth = _metric(row.get("depth_to_water_wet_m"), row.get("depth_to_water_dry_m"), " m")
        if depth:
            parts.append(f"water {depth}")
    elif category in ("minerals", "soil_land"):
        method = row.get("sampling_method")
        if method:
            parts.append(str(method))
        cover = _metric(row.get("overburden_min_m"), row.get("overburden_max_m"), " m")
        if cover:
            parts.append(f"overburden {cover}")
        if category == "minerals":
            res = row.get("residual_gravity_mgal")
            if res is not None:
                sign = "+" if res > 0 else ""
                parts.append(f"residual {sign}{res:g} mGal")
            elif (bouguer := row.get("bouguer_anomaly_mgal")) is not None:
                parts.append(f"Bouguer {bouguer} mGal")
            grad = row.get("gravity_gradient_mgal_km")
            if grad is not None:
                parts.append(f"grad {grad} mGal/km")
            zone = row.get("gravity_zone_name")
            if zone:
                short_zone = str(zone).split("(")[0].strip()
                parts.append(short_zone)
    elif category == "hazard_safety":
        klass = row.get("class_name")
        if klass:
            parts.append(f"hazard {klass}")

    return " / ".join(parts) or None


def target_rows(result: dict) -> list[dict]:
    """Flatten the engine's ranked candidates into rows for `survey_targets`.

    Coordinates are required rather than optional: a target nobody can drive to is not a
    result, and a row without a coordinate would sort as a NULL latitude forever.
    """
    rows: list[dict] = []
    for category, candidates in (result.get("candidates") or {}).items():
        for index, candidate in enumerate(candidates or [], start=1):
            if not isinstance(candidate, dict):
                continue
            lat, lon = _number(candidate.get("latitude")), _number(candidate.get("longitude"))
            if lat is None or lon is None:
                continue
            rows.append(
                {
                    "category": category,
                    "rank": int(_number(candidate.get("rank")) or index),
                    "latitude": lat,
                    "longitude": lon,
                    "score": _number(candidate.get("potential_score")),
                    "distance_km": _number(candidate.get("distance_from_target_km")),
                    "readout": readout(category, candidate),
                    "payload": candidate,
                }
            )
    return rows


def survey_files() -> list[tuple[str, Path, str]]:
    """Every deliverable this run really produced, as (kind, path, content_type).

    Existence is the only test. A survey that skipped the hazard category wrote no hazard
    map, and a download button for a file that is not there reads as a broken product.
    """
    found = []
    for kind, filename in SURVEY_DELIVERABLES.items():
        path = cfg.OUT / filename
        if path.is_file():
            suffix = path.suffix.lower()
            found.append((kind, path, CONTENT_TYPES.get(suffix, "application/octet-stream")))
    return found


def run_payload(run: dict) -> dict:
    """Translate a `survey_runs` row into the arguments the pipeline takes."""
    lat = float(run["latitude"])
    lon = float(run["longitude"])
    half = float(run.get("half_deg") or 0.12)
    categories = run.get("categories") or ["water", "minerals", "soil", "hazard"]
    client = (run.get("client_name") or "").strip() or "Site Survey"
    address = (run.get("address") or "").strip()
    return {
        "latitude": lat,
        "longitude": lon,
        "half_deg": half,
        "categories": list(categories),
        "client_name": client,
        "address": address,
        "data_sources": run.get("data_sources") or {},
        "composite": run.get("composite") or {},
    }


def reset_outputs() -> None:
    """Clear the shared output directory before a run writes into it.

    `cfg.OUT` is one directory for the whole process, and both `survey_files()` and
    `generate_site_dossier()` read it by existence alone. Left alone, a minerals-only run
    publishes the previous run's water map under its own id and workspace, and the dossier
    heads this site's numbers with the last site's scores. The per-AOI coverage cache in
    `cfg.RAW` is untouched, so nothing is re-downloaded.
    """
    if not cfg.OUT.is_dir():
        return
    for path in cfg.OUT.iterdir():
        if path.is_file():
            path.unlink()


@_single_site
def execute(payload: dict) -> dict:
    """Configure the AOI and survey it, exactly as the HTTP path did.

    The three setters below mutate the globals the engines read, which is why the whole
    run stays inside the single-site lock `survey_site` takes. Sources are read back from
    the provenance sidecars rather than echoed from the request: a cache hit from an
    earlier selection makes those differ, and a reader of this result needs what produced
    the score.
    """
    reset_outputs()
    cfg.set_target_site(
        payload["latitude"],
        payload["longitude"],
        half_deg=payload["half_deg"],
        client=payload["client_name"],
        address=payload["address"] or None,
    )
    sources = cfg.set_data_sources(payload["data_sources"])
    cfg.set_composite(payload["composite"], sources)

    result = survey_site(
        latitude=payload["latitude"],
        longitude=payload["longitude"],
        categories=payload["categories"],
        client_name=payload["client_name"],
        address=payload["address"],
        half_deg=payload["half_deg"],
    )
    result["target"] = cfg.target_block(
        payload["latitude"], payload["longitude"], payload["half_deg"]
    )
    return result


def web_tiles_payload(run: dict) -> None:
    """Cut the run's zone rasters into the map-view deliverables, never fatally.

    Tiles and web rasters are visual draperies over the analysis: if their
    cutting fails, the survey still publishes the PNG, GeoTIFF and KMZ results
    and the workbench keeps the single-image drape instead of the tile layer.
    """
    categories = run.get("categories") or []
    try:
        built = webtiles.build_survey_tiles(categories)
    except Exception as exc:  # noqa: BLE001 - the map is not worth the survey
        logger.warning("web map deliverables skipped for run %s: %s", run["id"], exc)
        return
    if built:
        logger.info("built %d web-map deliverable(s) for run %s", len(built), run["id"])


def report_progress(platform: Platform, run_id: str, status: str):
    """Build the stage reporter the pipeline calls, bound to one run.

    Every failure is swallowed. Progress is observability: a database blip while writing
    a percentage must never abort a survey that is otherwise running correctly. A stalled
    bar is recoverable; a killed survey has already spent the workspace's credits.
    """

    def report(stage: str, percent: int) -> None:
        try:
            platform.rpc(
                "update_survey_run_progress",
                {
                    "p_run_id": run_id,
                    "p_stage": stage,
                    "p_progress": int(percent),
                    "p_status": status,
                },
            )
        except Exception as exc:  # noqa: BLE001 - progress is never fatal
            logger.warning("progress write dropped for run %s: %s", run_id, exc)

    return report


def publish(platform: Platform, run: dict, result: dict) -> None:
    """Upload the files, then write the run's whole outcome in one call."""
    run_id = run["id"]
    workspace_id = run["workspace_id"]
    targets = target_rows(result)

    deliverables = []
    for kind, path, content_type in survey_files():
        object_path = f"{workspace_id}/{run_id}/{path.name}"
        body = path.read_bytes()
        platform.upload(object_path, body, content_type)
        deliverables.append(
            {
                "kind": kind,
                "storage_path": object_path,
                "content_type": content_type,
                "size_bytes": len(body),
            }
        )

    # The engine's own deliverable block names paths on this container's disk. They mean
    # nothing outside it, and leaving them in the result would give the app a link that
    # cannot work; the file rows above are the reference now.
    result.pop("deliverables", None)

    # Passed as objects, not strings: PostgREST binds a JSON object to a jsonb parameter
    # directly, and a dumped string would arrive typed as a scalar holding text.
    platform.rpc(
        "publish_survey_run",
        {
            "p_run_id": run_id,
            "p_result": result,
            "p_targets": targets,
            "p_deliverables": deliverables,
        },
    )
    logger.info("published run %s with %d target(s)", run_id, len(targets))


def handle(platform: Platform, run: dict) -> None:
    """Run one claimed job to either a published survey or a recorded failure."""
    run_id = run["id"]
    logger.info("claimed run %s at (%s, %s)", run_id, run.get("latitude"), run.get("longitude"))

    set_progress_callback(report_progress(platform, run_id, "surveying"))
    try:
        result = execute(run_payload(run))
        set_progress_callback(report_progress(platform, run_id, "publishing"))
        web_tiles_payload(run)
        publish(platform, run, result)
    except Exception as exc:  # noqa: BLE001 - a worker must survive any single job
        logger.exception("run %s failed", run_id)
        try:
            platform.rpc(
                "fail_survey_run",
                {"p_run_id": run_id, "p_error": f"{type(exc).__name__}: {exc}"},
            )
        except Exception as inner:  # noqa: BLE001
            # Nothing else can do it: the claim branch in `claim_next_survey_run`
            # re-offers the row once an hour, so the workspace sees a stalled bar rather
            # than a silently paid-for nothing.
            logger.error("could not record failure for run %s: %s", run_id, inner)
    finally:
        set_progress_callback(None)


_should_stop = False


def _stop(signum: int, _frame: object) -> None:
    global _should_stop
    _should_stop = True
    logger.info("signal %s received; finishing the current survey before exit", signum)


def _acquire_single_instance_lock():
    """Refuse to start a second worker.

    The engines keep the active AOI in module globals (`src.config`), so two
    workers sharing a state directory would analyse each other's area. Render is
    configured for one instance, but a manual `docker run` (or a mis-scaled
    service) must fail fast rather than corrupt results. Returns the open lock
    handle on success, or None when another worker holds it.
    """
    lock_path = cfg.STATE_DIR / "worker.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "a+", encoding="utf-8")
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    handle.seek(0)
    handle.truncate()
    handle.write(f"{WORKER_ID}\n")
    handle.flush()
    return handle


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    lock = _acquire_single_instance_lock()
    if lock is None:
        logger.error(
            "another worker already holds %s; refusing to start a second instance",
            cfg.STATE_DIR / "worker.lock",
        )
        return 1
    platform = Platform(
        first_env("SUPABASE_URL"),
        first_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    )

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    logger.info("worker %s polling for survey jobs", WORKER_ID)
    while not _should_stop:
        try:
            claimed = platform.rpc("claim_next_survey_run", {"p_worker_id": WORKER_ID})
        except Exception as exc:  # noqa: BLE001
            logger.warning("claim failed, retrying: %s", exc)
            claimed = None
            # A failed claim means the database is unreachable; back off rather than
            # spin, because the same outage will outlast any tighter retry loop.
            time.sleep(min(60.0, POLL_SECONDS * 6))
        if claimed:
            handle(platform, claimed)
        elif not _should_stop:
            time.sleep(POLL_SECONDS)

    logger.info("worker stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
