import { useEffect } from "react";

import { useMap } from "../ui/map.tsx";

const BORDER_LAYER_ID = "market-country-borders";
// Source + source-layer provided by the Carto basemap styles (positron /
// dark-matter). Carto's own admin-0 layer is painted a near-white tone that is
// invisible on the zoomed-out light globe, so we draw our own line on top.
const CARTO_SOURCE_ID = "carto";
const BOUNDARY_SOURCE_LAYER = "boundary";

/** Visible, theme-aware country borders over the Carto vector basemap.
 *  No-op when the tile-free self-contained style is active (no `carto` source). */
export default function CountryBorders() {
  const { map, isLoaded, resolvedTheme } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    // Only meaningful when the Carto vector basemap is loaded.
    if (!map.getSource(CARTO_SOURCE_ID)) return;
    if (map.getLayer(BORDER_LAYER_ID)) return;

    const color = resolvedTheme === "dark" ? "#64748b" : "#94a3b8";
    // Insert beneath the first symbol (label) layer so place names stay legible.
    const firstSymbolId = map
      .getStyle()
      .layers?.find((layer) => layer.type === "symbol")?.id;

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
          "line-width": 0.9,
          "line-opacity": 0.85,
        },
      },
      firstSymbolId,
    );

    return () => {
      if (map.getLayer(BORDER_LAYER_ID)) map.removeLayer(BORDER_LAYER_ID);
    };
  }, [map, isLoaded, resolvedTheme]);

  return null;
}
