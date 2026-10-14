import { useEffect } from "react";
import type * as GeoJSON from "geojson";

import { useMap } from "../ui/map.tsx";
import worldBordersRaw from "./worldBorders.json";

const worldBorders = worldBordersRaw as unknown as GeoJSON.FeatureCollection;

const BORDER_LAYER_ID = "market-country-borders";
const SOURCE_ID = "world-borders";

/** Visible, theme-aware country borders across the globe in both Carto and offline/fallback modes. */
export default function CountryBorders() {
  const { map, isLoaded, resolvedTheme } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    const color = resolvedTheme === "dark" ? "#64748b" : "#94a3b8";

    // If the style already baked in the world-borders layer (self-contained mode), update theme color if needed
    if (map.getLayer("world-borders-lines")) {
      const bakedColor = resolvedTheme === "dark" ? "#475569" : "#94a3b8";
      map.setPaintProperty("world-borders-lines", "line-color", bakedColor);
      return;
    }

    if (map.getLayer(BORDER_LAYER_ID)) {
      map.setPaintProperty(BORDER_LAYER_ID, "line-color", color);
      return;
    }

    // Insert beneath the first symbol (label) layer so place names stay legible.
    const firstSymbolId = map
      .getStyle()
      .layers?.find((layer) => layer.type === "symbol")?.id;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: worldBorders,
      });
    }

    map.addLayer(
      {
        id: BORDER_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": color,
          "line-width": 0.85,
          "line-opacity": 0.85,
        },
      },
      firstSymbolId,
    );

    return () => {
      if (map.getLayer(BORDER_LAYER_ID)) map.removeLayer(BORDER_LAYER_ID);
      if (map.getSource(SOURCE_ID) && !map.getLayer("world-borders-lines")) {
        map.removeSource(SOURCE_ID);
      }
    };
  }, [map, isLoaded, resolvedTheme]);

  return null;
}
