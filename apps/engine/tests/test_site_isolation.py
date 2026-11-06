"""Can two sites be analyzed in one process? Not while the geometry lives in globals.

`src.config.set_target_site()` mutates ~20 module-level names (BBOX_WGS84, WIDTH/HEIGHT,
TARGET_ROW/COL, LOCAL_CRS, RAW, AOI_SLUG, CLIENT). Every engine reads them at call time,
so a second request arriving mid-survey silently re-points the first request's raster
warps, cell reads and summary output at a different AOI -- wrong numbers, right-looking
JSON. The xfail tests below are the red line an immutable per-job SiteContext must clear.
The passing tests guard what holds in its place today: the serial path leaves nothing
stale, and only one survey is allowed to run per process.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

import src.config as cfg

SITE_A = (-19.504874, 29.845979)
SITE_B = (-20.210000, 30.410000)

_STATE = ("AOI_SLUG", "RAW", "BBOX_WGS84", "TARGET_ROW", "TARGET_COL", "TARGET_LAT",
          "TARGET_LON", "HALF_DEG", "WIDTH", "HEIGHT", "LOCAL_CRS", "EPSG", "UTM_ZONE",
          "CLIENT", "CLIENT_ADDRESS", "OUT")


@pytest.fixture(autouse=True)
def _restore_config():
    saved = {name: getattr(cfg, name) for name in _STATE}
    yield
    for name, value in saved.items():
        setattr(cfg, name, value)


def _snapshot() -> dict:
    return {
        "slug": cfg.AOI_SLUG,
        "raw": cfg.RAW.name,
        "bbox": cfg.BBOX_WGS84,
        "row": cfg.TARGET_ROW,
        "col": cfg.TARGET_COL,
        "crs": str(cfg.LOCAL_CRS),
        "height": cfg.HEIGHT,
        "width": cfg.WIDTH,
    }


def test_switching_sites_re_derives_every_geometry_field():
    """The serial path is only correct because a switch overwrites every derived value."""
    cfg.set_target_site(*SITE_A, client="Alpha")
    a = _snapshot()
    cfg.set_target_site(*SITE_B, client="Bravo")
    b = _snapshot()

    for key in ("slug", "raw", "bbox", "crs", "height", "width"):
        assert b[key] != a[key], f"{key} kept site A's value after switching to B"
    assert 0 <= b["row"] < cfg.HEIGHT and 0 <= b["col"] < cfg.WIDTH, (
        "target pixel fell outside the newly derived AOI grid")


@pytest.mark.xfail(
    strict=True,
    reason="Phase 0: the site lock avoids the overlap instead of making AOIs independent; "
           "an immutable per-job SiteContext is what lets two AOIs truly share a process",
)
def test_a_survey_keeps_its_own_aoi_while_another_is_requested():
    started_a = threading.Event()
    release_a = threading.Event()
    results: dict[str, tuple[dict, dict]] = {}

    def survey_a():
        cfg.set_target_site(*SITE_A, client="Alpha")
        mine = _snapshot()
        started_a.set()
        release_a.wait(5)  # stands in for the seconds an engine spends warping layers
        results["a"] = (mine, _snapshot())

    def request_b():
        started_a.wait(5)
        cfg.set_target_site(*SITE_B, client="Bravo")
        release_a.set()

    thread_a = threading.Thread(target=survey_a)
    thread_b = threading.Thread(target=request_b)
    thread_a.start()
    thread_b.start()
    thread_a.join()
    thread_b.join()

    mine, after = results["a"]
    assert mine["slug"] == "19.50S_29.85E"
    assert after == mine, "site A's geometry moved to another AOI mid-survey"


@pytest.mark.xfail(
    strict=True,
    reason="Phase 0: deliverables are not namespaced per AOI, so the second site overwrites the first",
)
def test_two_sites_do_not_publish_to_the_same_files():
    cfg.set_target_site(*SITE_A, client="Alpha")
    a_summary, a_map = cfg.OUT / "summary.json", cfg.OUT / "groundwater_potential_map.png"
    a_dossier = cfg.OUT / "master_site_dossier.json"

    cfg.set_target_site(*SITE_B, client="Bravo")
    b_summary, b_map = cfg.OUT / "summary.json", cfg.OUT / "groundwater_potential_map.png"
    b_dossier = cfg.OUT / "master_site_dossier.json"

    assert a_summary != b_summary, "both AOIs write the same summary.json"
    assert a_dossier != b_dossier, "both AOIs overwrite the same client dossier"
    assert a_map != b_map, "both AOIs overwrite the same deliverable map"


def test_only_one_survey_runs_per_process():
    """The lock is what makes the threadpool safe; drop it with the SiteContext refactor."""
    from src.mcp.server import _single_site

    running = threading.Event()
    overlaps: list[str] = []

    @_single_site
    def survey(tag: str) -> str:
        if running.is_set():
            overlaps.append(tag)
        running.set()
        time.sleep(0.05)
        running.clear()
        return tag

    with ThreadPoolExecutor(max_workers=2) as pool:
        order = list(pool.map(survey, ["alpha", "bravo"]))

    assert order == ["alpha", "bravo"]
    assert not overlaps, f"two AOIs were under analysis at once: {overlaps}"


def test_every_site_choosing_tool_takes_the_lock():
    """A tool that mutates src.config outside the lock reintroduces the cross-AOI bug."""
    from src.mcp import server

    for name in ("survey_site", "get_boreholes", "get_minerals", "get_soil_capability",
                 "get_hazard_safety", "get_executive_dossier"):
        tool = getattr(server, name)
        assert hasattr(tool, "__wrapped__"), f"{name} runs without the single-flight lock"
