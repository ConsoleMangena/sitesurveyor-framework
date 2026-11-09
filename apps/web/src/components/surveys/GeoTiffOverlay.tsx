import { useEffect, useRef, useState } from "react";
import type { ImageOverlay as LeafletImageOverlay } from "leaflet";
import { ImageOverlay, useMap } from "react-leaflet";
import type { GeoTIFFImage } from "geotiff";

import type { LatLngTuple } from "../../lib/surveys/workbench.ts";
import { DRAPE_Z_INDEX } from "../../lib/surveys/workbench.ts";
import {
  RASTER_NODATA_CLASS,
  colorMapToRgba,
  colorizeClasses,
  makeTransparent,
  paletteToRgba,
} from "../../lib/surveys/rasterPalette.ts";

interface GeoTiffOverlayProps {
  /** Signed URL of the classified zone GeoTIFF. */
  url?: string | null;
  /** PNG overlay shown while the GeoTIFF decodes, and kept if decoding fails. */
  fallbackUrl?: string | null;
  bounds: [LatLngTuple, LatLngTuple];
  opacity: number;
  /** Colours used when the file carries no colour table. */
  palette?: readonly string[];
  /** Class codes the drape leaves see-through: ground the survey did not find on. */
  transparentCodes?: readonly number[];
  zIndex?: number;
}

interface DecodedRaster {
  dataUrl: string;
  width: number;
}

interface DecodedState {
  url: string;
  raster: DecodedRaster;
}

/**
 * Draw a single-band classified GeoTIFF on the Leaflet map.
 *
 * The PNG overlay is a flattened snapshot; this reads the survey's actual GeoTIFF,
 * colourises its class codes at the raster's native resolution, and hands Leaflet an
 * image that stays sharp when zoomed past one screen pixel per cell. If the fetch or
 * decode fails, the PNG remains visible rather than leaving the map blank.
 */
export default function GeoTiffOverlay({
  url,
  fallbackUrl,
  bounds,
  opacity,
  palette,
  transparentCodes = [],
  zIndex = DRAPE_Z_INDEX,
}: GeoTiffOverlayProps) {
  const map = useMap();
  const layerRef = useRef<LeafletImageOverlay | null>(null);
  const [decodedState, setDecodedState] = useState<DecodedState | null>(null);
  // A new signed URL must not keep the previous survey's pixels on screen while it loads.
  const decoded = decodedState && decodedState.url === url ? decodedState.raster : null;

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    void decodeGeoTiff(url, palette, transparentCodes, controller.signal)
      .then((raster) => {
        if (!controller.signal.aborted) setDecodedState({ url, raster });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("GeoTIFF overlay could not be decoded; keeping the PNG overlay.", error);
      });

    return () => controller.abort();
  }, [url, palette, transparentCodes]);

  useEffect(() => {
    const layer = layerRef.current;
    const image = layer?.getElement();
    if (!decoded || !layer || !image) return;

    const applySharpness = () => {
      const layerBounds = layer.getBounds();
      const southWest = map.project(layerBounds.getSouthWest(), map.getZoom());
      const northEast = map.project(layerBounds.getNorthEast(), map.getZoom());
      const projectedWidth = Math.abs(northEast.x - southWest.x);
      // Above native resolution the class grid is the truth, so keep cell edges hard.
      // Below it, let the browser average so thin zones are not dropped by aliasing.
      image.style.imageRendering = projectedWidth >= decoded.width ? "pixelated" : "auto";
    };

    applySharpness();
    map.on("zoomend", applySharpness);
    return () => {
      map.off("zoomend", applySharpness);
    };
  }, [decoded, map]);

  return (
    <>
      {!decoded && fallbackUrl ? (
        <ImageOverlay
          url={fallbackUrl}
          bounds={bounds}
          opacity={opacity}
          zIndex={zIndex}
          interactive={false}
        />
      ) : null}
      {decoded ? (
        <ImageOverlay
          ref={layerRef}
          url={decoded.dataUrl}
          bounds={bounds}
          opacity={opacity}
          zIndex={zIndex}
          interactive={false}
        />
      ) : null}
    </>
  );
}

async function decodeGeoTiff(
  url: string,
  palette: readonly string[] | undefined,
  transparentCodes: readonly number[],
  signal: AbortSignal,
): Promise<DecodedRaster> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`GeoTIFF request failed with ${response.status}`);
  }

  // Decoding is only needed once someone opens a survey with a GeoTIFF layer,
  // so keep the decoder out of the initial map bundle.
  const { fromArrayBuffer } = await import("geotiff");
  const tiff = await fromArrayBuffer(await response.arrayBuffer(), signal);
  const image = await tiff.getImage();
  if (image.getSamplesPerPixel() !== 1 || image.getBitsPerSample(0) !== 8) {
    throw new Error("expected a single-band 8-bit classified raster");
  }

  const width = image.getWidth();
  const height = image.getHeight();
  const [band] = await image.readRasters({ samples: [0], signal });
  if (!band || band.length !== width * height) {
    throw new Error("GeoTIFF band size did not match its dimensions");
  }

  const colorMap = await readColorMap(image);
  const lut = colorMap ? colorMapToRgba(colorMap) : null;
  const table = lut ?? paletteToRgba(palette ?? []);
  makeTransparent(table, RASTER_NODATA_CLASS);
  const nodata = image.getGDALNoData();
  if (nodata !== null) makeTransparent(table, nodata);
  // A GTiff colour table is RGB-only, so the engine cannot store this alpha in the file.
  for (const code of transparentCodes) makeTransparent(table, code);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2D is unavailable");

  context.putImageData(
    new ImageData(colorizeClasses(band, table), width, height),
    0,
    0,
  );

  return { dataUrl: canvas.toDataURL("image/png"), width };
}

async function readColorMap(image: GeoTIFFImage): Promise<ArrayLike<number> | null> {
  try {
    const value: unknown = await image.getFileDirectory().loadValue("ColorMap");
    if (value instanceof Uint16Array || value instanceof Uint8Array) return value;
    if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
      return value as number[];
    }
  } catch {
    // A file without a colour map is normal; the category palette covers it.
  }
  return null;
}
