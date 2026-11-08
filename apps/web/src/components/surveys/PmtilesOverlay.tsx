import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import type { Layer as LeafletLayer } from "leaflet";

import type { SurveyTilesSource } from "../../lib/repositories/satelliteSurveys.ts";

interface PmtilesOverlayProps {
  /** One archive reader wired to the deliverable-range edge function. */
  source: SurveyTilesSource | null;
  opacity: number;
  /** Calls once, if the archive cannot be fetched or parsed; the caller keeps its image drape. */
  onUnavailable?: () => void;
}

const MAX_NATIVE_ZOOM = 16;
const MIN_ZOOM = 7;

/**
 * Draw a survey's zone classes as real map tiles from one PMTiles archive.
 *
 * The archive is a single object in the private deliverables bucket, read one
 * byte slice at a time through the `deliverable-file` edge function: the
 * browser only pulls the archive's directory entries and tile bytes for the
 * viewport, so panning and zooming to the analysis grid's native 30 m density
 * costs kilobytes, not the whole raster. The function carries this session's
 * token and re-proves workspace ownership per request -- no scoped link is
 * minted and nothing is left valid longer than the session itself. The class
 * colours are baked into the tiles by the engine, so what the map paints is
 * exactly what the GeoTIFF colour table says.
 *
 * Failure keeps the map alive: the page renders its existing single-image
 * (GeoTIFF/PNG) drape, which is also what older runs without an archive get.
 */
export default function PmtilesOverlay({
  source,
  opacity,
  onUnavailable,
}: PmtilesOverlayProps) {
  const map = useMap();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setUnavailable(false);
  }, [source]);

  useEffect(() => {
    if (!source) return;

    let cancelled = false;
    let layer: LeafletLayer | null = null;

    void (async () => {
      try {
        // The tile reader is only needed once someone opens a survey with a
        // tile archive, so keep it out of the initial map bundle -- the
        // GeoTIFF decoder is lazy for the same reason.
        const { PMTiles, leafletRasterLayer } = await import("pmtiles");
        const archive = new PMTiles(source);
        // A header round-trip is the cheapest proof that the proxy served a
        // real archive; if it failed, the drape must not sit on a layer that
        // will never paint.
        await archive.getHeader();
        if (cancelled) return;
        layer = leafletRasterLayer(archive, {
          opacity,
          maxNativeZoom: MAX_NATIVE_ZOOM,
          minZoom: MIN_ZOOM,
          attribution: "SiteSurveyor AI · classified DE Africa coverage data",
        }) as LeafletLayer;
        layer.addTo(map);
        if (cancelled) {
          map.removeLayer(layer);
          layer = null;
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setUnavailable(true);
          onUnavailable?.();
        }
        console.warn("PMTiles overlay not available; keeping the image drape.", error);
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, source, opacity, onUnavailable]);

  return null;
}
