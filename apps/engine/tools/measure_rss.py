"""Sample this process's resident memory while one category survey runs, to size the instance.

Render's starter instance killed the service at the export stage with no traceback and no
exit status -- SIGKILL at its 512 MB limit -- so the open question is which stage holds the
memory, not whether the ceiling is reached.
"""
from __future__ import annotations

import ctypes
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, ".")

SAMPLE_SECONDS = 0.3

# Set when --alloc is passed; keeps tracemalloc out of the plain RSS runs entirely.
_tracer = None


class _Counters(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.c_uint32),
        ("page_fault_count", ctypes.c_uint32),
        ("peak_working_set", ctypes.c_size_t),
        ("working_set", ctypes.c_size_t),
        ("quota_paged_pool", ctypes.c_size_t),
        ("peak_quota_paged_pool", ctypes.c_size_t),
        ("quota_nonpaged_pool", ctypes.c_size_t),
        ("peak_quota_nonpaged_pool", ctypes.c_size_t),
        ("pagefile", ctypes.c_size_t),
        ("peak_pagefile", ctypes.c_size_t),
        ("private_usage", ctypes.c_size_t),
    ]


def _psapi() -> tuple[float, float]:
    """(current, peak) working set in MB, read straight from the OS so no dependency
    enters the image."""
    if sys.platform != "win32":
        with open("/proc/self/statm") as fh:
            current = int(fh.read().split()[1]) * 4096 / 1024 / 1024
        peak = current
        with open("/proc/self/status") as fh:
            for line in fh:
                if line.startswith("VmHWM:"):
                    peak = float(line.split()[1]) / 1024
        return current, peak

    kernel32 = ctypes.WinDLL("Kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("Psapi", use_last_error=True)
    kernel32.GetCurrentProcess.restype = ctypes.c_void_p
    counters = _Counters()
    counters.cb = ctypes.sizeof(_Counters)
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32]
    psapi.GetProcessMemoryInfo.restype = ctypes.c_int
    if not psapi.GetProcessMemoryInfo(
        kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb
    ):
        return float("nan"), float("nan")
    return (counters.working_set / 1024 / 1024, counters.peak_working_set / 1024 / 1024)


def current_rss_mb() -> float:
    """Working set right now. Windows is asked directly because its peak is a high-water
    mark that only resets with the process, so the trace needs the live value."""
    return _psapi()[0]


def peak_rss_mb() -> float:
    return _psapi()[1]


def _attribute_outputs(survey, trace_allocations: bool = False) -> None:
    """Print the memory delta of every map and GeoTIFF written during export.

    safe_savefig/write_raster are imported into each engine's own namespace, so the patch
    has to land there. The OS peak only ever rises, so whichever call moves it owns the
    spike.
    """
    engine = sys.modules[survey.__module__]
    for name in ("safe_savefig", "write_raster"):
        original = getattr(engine, name, None)
        if original is None:
            continue

        def timed(func=original, label=name):
            def wrapper(*args, **kwargs):
                before = current_rss_mb()
                snapshot = _tracer.take_snapshot() if _tracer else None
                result = func(*args, **kwargs)
                target = args[1] if label == "safe_savefig" and len(args) > 1 else args[0]
                print(f"    [rss] {label} {Path(target).name}: "
                      f"{before:.0f} -> {current_rss_mb():.0f} MB, "
                      f"os peak {peak_rss_mb():.0f} MB", flush=True)
                if snapshot is not None:
                    after = _tracer.take_snapshot()
                    for stat in after.compare_to(snapshot, "traceback")[:6]:
                        frames = stat.traceback.format()
                        print("        " + " | ".join(frames[-3:]),
                              f"[+{stat.size_diff / 1024 / 1024:.0f} MB]", flush=True)
                return result
            return wrapper

        engine.__dict__[name] = timed()


def main() -> int:
    category = (sys.argv[1] if len(sys.argv) > 1 else "hazard").lower()
    if category == "hazard":
        from src.engines.hazard import run_hazard_survey as survey
    elif category == "water":
        from src.engines.water import run_water_survey as survey
    elif category == "minerals":
        from src.engines.minerals import run_minerals_survey as survey
    elif category == "soil":
        from src.engines.soil import run_soil_survey as survey
    elif category == "all":
        # The endpoint the dashboard actually calls: one process, four engines in a row.
        from src.config import set_target_site
        from src.mcp.server import survey_site

        set_target_site(-19.50487490194389, 29.84597927542165)
        survey = lambda: survey_site(-19.50487490194389, 29.84597927542165, ["all"])
    else:
        raise SystemExit(f"unsupported category {category!r}")

    if "--alloc" in sys.argv:
        import tracemalloc

        global _tracer
        tracemalloc.start(15)
        _tracer = tracemalloc

    if "--by-output" in sys.argv:
        _attribute_outputs(survey)

    trace: list[tuple[float, float]] = []
    stop = threading.Event()

    def sampler() -> None:
        previous = 0.0
        while not stop.is_set():
            t, mb = time.perf_counter() - start, current_rss_mb()
            trace.append((t, mb))
            # Printed live so the ramp lines up with the survey's own [n/6] stage banners.
            if abs(mb - previous) >= 15:
                print(f"  t+{t:6.1f}s  {mb:7.0f} MB", flush=True)
                previous = mb
            time.sleep(SAMPLE_SECONDS)

    print(f"baseline RSS: {current_rss_mb():.0f} MB", flush=True)
    start = time.perf_counter()
    thread = threading.Thread(target=sampler, daemon=True)
    thread.start()
    survey()
    stop.set()
    thread.join(timeout=2)

    peak_t, peak_mb = max(trace, key=lambda sample: sample[1])
    print(f"{category}: finished in {time.perf_counter() - start:.1f}s, "
          f"traced peak {peak_mb:.0f} MB at t+{peak_t:.1f}s, "
          f"os peak {peak_rss_mb():.0f} MB", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
