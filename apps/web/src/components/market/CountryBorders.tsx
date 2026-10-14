import { useEffect } from "react";

import { useMap } from "../ui/map.tsx";

const BORDER_LAYER_ID = "market-country-borders";
const CARTO_SOURCE_ID = "carto";
const BOUNDARY_SOURCE_LAYER = "boundary";

/**
 * Visible, theme-aware country borders over the Carto vector basemap.
 * When the tile-free self-contained globe is active, borders are already baked into its style.
 */
export default function CountryBorders() {
  const { map, isLoaded, resolvedTheme } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    try {
      // If the self-contained style is active, update baked layer theme color if present
      if (map.getLayer("world-borders-lines")) {
        const bakedColor = resolvedTheme === "dark" ? "#475569" : "#94a3b8";
        map.setPaintProperty("world-borders-lines", "line-color", bakedColor);
        return;
      }

      const color = resolvedTheme === "dark" ? "#64748b" : "#94a3b8";

      // If Carto vector basemap has the native boundary_country_inner layer, tune it for clear visibility
      if (map.getLayer("boundary_country_inner")) {
        map.setPaintProperty("boundary_country_inner", "line-color", color);
        map.setPaintProperty("boundary_country_inner", "line-width", 1.0);
        map.setPaintProperty("boundary_country_inner", "line-opacity", 0.85);
        return;
      }

      // Only add custom layer when Carto vector basemap is active
      if (!map.getSource(CARTO_SOURCE_ID)) return;

      if (map.getLayer(BORDER_LAYER_ID)) {
        map.setPaintProperty(BORDER_LAYER_ID, "line-color", color);
        return;
      }

      const style = map.getStyle();
      const firstSymbolId = style?.layers?.find((layer) => layer.type === "symbol")?.id;

      map.addLayer(
        {
          id: BORDER_LAYER_ID,
          type: "line",
          source: CARTO_SOURCE_ID,
          "source-layer": BOUNDARY_SOURCE_LAYER,
          filter: [
            "all",
            ["==", "admin_level", 2],
            ["==", "maritime", 0],
          ],
          paint: {
            "line-color": color,
            "line-width": 1.0,
            "line-opacity": 0.85,
          },
        },
        firstSymbolId,
      );
    } catch {
      // Safe guard against map lifecycle transitions
    }

    return () => {
      try {
        if (map.getLayer(BORDER_LAYER_ID)) {
          map.removeLayer(BORDER_LAYER_ID);
        }
      } catch {
        // Safe guard against destroyed map
      }
    };
  }, [map, isLoaded, resolvedTheme]);

  return null;
}
