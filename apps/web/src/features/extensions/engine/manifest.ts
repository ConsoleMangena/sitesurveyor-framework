import type { ExtensionManifest } from "../types.ts";

const ENGINE_URL = (import.meta.env.VITE_SITESURVEYOR_ENGINE_URL ?? "").toString();

/**
 * The satellite intelligence engine that lives beside this repo as a Python
 * service (`sitesurveyorai`). It is a FastAPI app: `src/api.py` in that project
 * serves `/health`, `/api/survey`, `/api/jobs/{id}`, `/api/dossier` and the
 * `/outputs` artefacts this extension renders.
 */
export const SATELLITE_INTELLIGENCE: ExtensionManifest = {
  id: "satellite-intelligence",
  name: "Satellite Intelligence Engine",
  tagline: "Multi-criteria satellite screening for any site in Africa",
  description:
    "Runs the SiteSurveyor geospatial engine against a target coordinate: Sentinel-2, Copernicus DEM, ALOS PALSAR, Landsat WOfS, ESA WorldCover and CHIRPS feed four scoring engines — groundwater, mineral prospectivity, soil capability and multi-hazard safety — and return a ranked executive dossier with maps, KMZ field targets and client reports.",
  version: "2.0.0",
  publisher: "Eineva Labs",
  category: "intelligence",
  icon: "satellite",
  sourceUrl: "https://github.com/Eineva-Labs/SiteSurveyorAI",
  capabilities: [
    {
      label: "Satellite site screening",
      detail:
        "Groundwater, minerals, soil and hazard scores for one coordinate, with the input coverages each score came from.",
    },
    {
      label: "Ranked field targets",
      detail:
        "Candidate borehole, exploration, land-zone and safe-build points with distance, score and the verification step each needs.",
    },
    {
      label: "Deliverables in the workspace",
      detail:
        "Category maps, per-category HTML reports, GeoTIFF raster viewers and mobile GPS KMZ files, straight from the engine.",
    },
    {
      label: "Satellite Survey in the navigation",
      detail:
        "Enabling this extension adds its own page to the sidebar and the command palette.",
    },
  ],
  contributes: {
    view: "satellite",
    label: "Satellite Survey",
    icon: "satellite",
    group: "INTELLIGENCE",
    description: "Run a satellite screening survey and read its dossier.",
  },
  endpoint: {
    label: "Engine URL",
    placeholder: "https://sitesurveyor-engine.onrender.com",
    hint:
      "Base URL of a running SiteSurveyor AI engine, including https:// and no trailing slash. " +
      "The engine must list this app's origin in its ALLOWED_ORIGINS or the browser will block every call.",
    defaultUrl: ENGINE_URL,
  },
  installedByDefault: true,
  enabledByDefault: true,
};
