import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Feature as GeoJsonFeature } from "geojson";

import type { ZoneCollection, ZoneProperties } from "../../lib/surveys/zoneLayers.ts";

interface ClassifiedVectorLayerProps {
  data: ZoneCollection | null;
  /** Fill strength for the class zones. */
  opacity: number;
}

/**
 * The survey's classification drawn as map layers rather than as a picture.
 *
 * A classified raster draped on the map is a photograph of the zones: it softens at the
 * zoom a reader wants, it cannot be styled, and clicking it says nothing. These are the
 * same zones as real vector geometry, so they stay crisp, they carry their class name,
 * and the legend and the map agree because they read the same file.
 */
export default function ClassifiedVectorLayer({ data, opacity }: ClassifiedVectorLayerProps) {
  const map = useMap();

  const style = useMemo(
    () => (feature?: GeoJsonFeature) => {
      const properties = feature?.properties as ZoneProperties | undefined;
      if (!properties?.color) return { weight: 0, fillOpacity: 0 };
      return {
        color: properties.color,
        weight: 1,
        opacity: 0.85,
        fillColor: properties.color,
        fillOpacity: opacity,
      };
    },
    [opacity],
  );

  const onEachFeature = useMemo(
    () => (feature: GeoJsonFeature, layer: L.Layer) => {
      const properties = feature?.properties as ZoneProperties | undefined;
      if (!properties?.class_label) return;
      layer.bindTooltip(
        `${properties.class_label} · ${Math.round(properties.area_ha).toLocaleString()} ha`,
        { sticky: true },
      );
    },
    [],
  );

  useEffect(() => {
    if (!data) return;

    // A district's classification is hundreds of regions with thousands of vertices. The
    // canvas renderer draws them as one surface instead of one SVG node each, which is the
    // difference between a map that pans and a map that stutters. The renderer belongs to
    // this layer and to nothing else, so it is created and torn down with it.
    const renderer = L.canvas({ padding: 0.4 });
    const options: L.GeoJSONOptions & { renderer?: L.Renderer } = {
      renderer,
      style,
      onEachFeature,
    };
    const layer = L.geoJSON(data, options);
    layer.addTo(map);

    return () => {
      layer.remove();
      map.removeLayer(renderer);
    };
  }, [data, map, onEachFeature, style]);

  return null;
}
