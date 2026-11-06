"""
Layer download: streaming, atomicity and the retry/skip decision.

`_download` decides whether a survey runs on real evidence or silently loses a layer, and
it is also where a cold fetch used to buffer a 188 MB coverage into RAM before writing it —
the peak that killed the instance during `[6/6] Exporting…`. The fake response below
deliberately has no `.content` attribute, so reading the body in one piece fails the test.
"""
from __future__ import annotations

import pytest

import src.fetch_data as fd


class _StreamedResponse:
    def __init__(self, status_code: int, body: bytes):
        self.status_code = status_code
        self._body = body
        self.text = body.decode("utf-8", "replace")
        self.chunks_served = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def iter_content(self, chunk_size: int):
        step = max(1, chunk_size)
        for i in range(0, len(self._body), step):
            self.chunks_served += 1
            yield self._body[i : i + step]


def _install(monkeypatch, responses: list[_StreamedResponse]):
    calls: list[int] = []

    def fake_get(url, headers=None, timeout=None, stream=False, **kwargs):
        calls.append(len(calls) + 1)
        return responses[min(len(responses) - 1, len(calls) - 1)]

    monkeypatch.setattr(fd.requests, "get", fake_get)
    monkeypatch.setattr(fd._time, "sleep", lambda _s: None)
    return calls


def _valid_geotiff_bytes(tmp_path) -> bytes:
    """A real 2x2 GeoTIFF, because _download opens the finished file to log its shape."""
    import numpy as np
    import rasterio

    path = tmp_path / "source.tif"
    with rasterio.open(
        path, "w", driver="GTiff", width=2, height=2, count=1, dtype="uint8",
        crs="EPSG:4326", transform=rasterio.transform.from_origin(29.8, -19.5, 0.001, 0.001),
    ) as ds:
        ds.write(np.ones((2, 2), dtype="uint8"), 1)
    return path.read_bytes()


GEOTIFF_HEADER = b"II*\x00"


def test_body_is_streamed_to_disk_and_moved_into_place(tmp_path, monkeypatch):
    out = tmp_path / "geomad.tif"
    body = _valid_geotiff_bytes(tmp_path)
    calls = _install(monkeypatch, [_StreamedResponse(200, body)])

    assert fd._download("https://example/wcs", out, retries=1) is True
    assert out.read_bytes() == body
    assert calls == [1], "first attempt should have been enough"
    assert not list(tmp_path.glob("*.part")), "part file survived a successful download"


def test_a_missing_optional_layer_is_skipped_not_retried(tmp_path, monkeypatch):
    out = tmp_path / "wq_annual.tif"
    calls = _install(monkeypatch, [_StreamedResponse(404, b"NoCoverage")])

    assert fd._download("https://example/wcs", out, retries=4, optional=True) is False
    assert calls == [1], "an empty archive is a fact, not a transient fault"
    assert not out.exists()


def test_a_200_that_is_not_a_geotiff_is_retried_then_fails_loudly(tmp_path, monkeypatch):
    out = tmp_path / "dem.tif"
    xml_error = b"<?xml version='1.0'?><Exception code='NoApplicableCode'>boom</Exception>"
    calls = _install(monkeypatch, [_StreamedResponse(200, xml_error)])

    with pytest.raises(RuntimeError):
        fd._download("https://example/wcs", out, retries=3)
    assert len(calls) == 3
    assert not out.exists(), "an invalid body must never be published as a layer"
    assert not list(tmp_path.glob("*.part")), "failed attempt left a partial file behind"


def test_a_dead_connection_is_retried_and_the_partial_is_discarded(tmp_path, monkeypatch):
    out = tmp_path / "alos.tif"

    class _Dying(_StreamedResponse):
        def iter_content(self, chunk_size: int):
            yield GEOTIFF_HEADER
            raise ConnectionError("chunked transfer closed")

    calls = _install(monkeypatch, [_Dying(200, GEOTIFF_HEADER)])

    assert fd._download("https://example/wcs", out, retries=2, optional=True) is False
    assert len(calls) == 2
    assert not out.exists(), "a half-written raster would open fine and read as garbage"
    assert not list(tmp_path.glob("*.part"))
