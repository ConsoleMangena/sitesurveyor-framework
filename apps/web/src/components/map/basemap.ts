/**
 * Keyless, near-monochrome basemap from Esri's public ArcGIS services. The base
 * layer carries land/water shading and the reference layer adds quiet labels —
 * the same restrained look as CARTO Positron without an API key.
 *
 * Shared by the market globe and the transport map so both surfaces sit on
 * exactly the same ground.
 */

export const BASEMAP_BASE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const BASEMAP_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
export const BASEMAP_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const BASEMAP_MAX_NATIVE_ZOOM = 16;
