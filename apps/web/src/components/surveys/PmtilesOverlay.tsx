import { useEffect, useRef, useState } from "react";
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

type OpacityLayer = LeafletLayer & { setOpacity?: (opacity: number) => void };

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
 * The build is deliberately **not** keyed on the map's readout callbacks: the
 * workbench re-renders on every pan and zoom tick, and a rebuilt layer means a
 * new archive read and a blank stretch between removing the old paint and
 * finishing the new one -- the layer must outlive those re-renders. Opacity is
 * applied to the live layer rather than triggering any rebuild.
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
  // Ticks up when the layer lands, so the opacity effect also catches the
  // creation itself and not only later slider moves.
  const [layerTick, setLayerTick] = useState(0);
  const layerRef = useRef<OpacityLayer | null>(null);
  // The fallback hand-off is read by reference: a fresh inline callback from
  // the parent is not a change in what the layer should do.
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  // Live opacity, without a teardown.
  useEffect(() => {
    layerRef.current?.setOpacity?.(opacity);
  }, [opacity, layerTick]);

  useEffect(() => {
    setUnavailable(false);
  }, [source]);

  useEffect(() => {
    if (!source) return;

    let cancelled = false;
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
        const layer = leafletRasterLayer(archive, {
          opacity,
          maxNativeZoom: MAX_NATIVE_ZOOM,
          minZoom: MIN_ZOOM,
          attribution: "SiteSurveyor AI · classified DE Africa coverage data",
        }) as OpacityLayer;
        if (cancelled) return;
        layer.addTo(map);
        if (cancelled) {
          map.removeLayer(layer);
          return;
        }
        layerRef.current = layer;
        setLayerTick((tick) => tick + 1);
      } catch (error: unknown) {
        if (!cancelled) {
          setUnavailable(true);
          onUnavailableRef.current?.();
        }
        console.warn("PMTiles overlay not available; keeping the image drape.", error);
      }
    })();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // The workbench re-renders on every map move; only a real change of
    // reader, map or source should restart this build.
    // (eslint-disable-next-line react-hooks/exhaustive-deps) -- intentional.
  }, [map, source]);

  return null;
}
