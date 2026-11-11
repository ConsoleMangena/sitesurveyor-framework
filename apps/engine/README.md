# SiteSurveyor satellite engine

Python engine behind Earth Observation in the platform. It ingests multi-sensor satellite data —
Sentinel-2, Copernicus DEM 30 m, ALOS PALSAR, Landsat WOfS 1984–2024, ESA WorldCover, CHIRPS — and
runs AHP/MCDA scoring to produce site screening, hazard due diligence and ranked field targets.

It is a **backend worker**, not a user-facing client, and it is a different feature from full-file
anchoring: this analyses imagery, it does not store or prove files.

## Interfaces

1. **Worker (what the platform deploys).** `python worker.py` claims `survey_runs` rows written by the
   `satellite-survey` Edge Function (`FOR UPDATE SKIP LOCKED`), runs the pipelines and publishes
   deliverables and status back. Deployment notes: [`docs/RENDER_DEPLOYMENT.md`](docs/RENDER_DEPLOYMENT.md).
2. **MCP server.** `python -m src.mcp_server` exposes the same screening as tools over stdio (or
   `--transport sse` on port 8000) for Claude, Cursor or another MCP host.
3. **CLI.** `python main.py` for batch runs, local testing and map generation with no database.

```bash
python main.py --category all        # every category, then the dossier
python main.py --category water      # or minerals | soil | hazard
python main.py --report              # rebuild the dossier from existing outputs
```

## MCP tools

`survey_site(latitude, longitude, categories)` — full multi-domain screening ·
`get_boreholes(...)` — prioritised borehole targets with VES advice ·
`get_minerals(...)` — shear-zone gold prospectivity and alteration ·
`get_soil_capability(...)` — agricultural suitability and erosion risk ·
`get_hazard_safety(...)` — flood, slope and wildfire risk plus safest sites ·
`get_executive_dossier()` — multi-criteria scorecard across categories that ran.

Client config block: [`mcp_config.json`](mcp_config.json) · full guide: [`docs/MCP_GUIDE.md`](docs/MCP_GUIDE.md).

## Categories

| Category | Engine | Deliverables |
| --- | --- | --- |
| Water | `src/engines/water.py` | Groundwater potential map, candidate borehole sites (CSV/GeoJSON/KMZ), geoTIFF |
| Minerals | `src/engines/minerals.py` | Prospectivity map, ranked targets, commodity zone and index geoTIFFs — nine deposit styles screened, three named as unscreenable |
| Soil & land | `src/engines/soil.py` | Soil capability map, candidate land zones, index geoTIFF |
| Hazard | `src/engines/hazard.py` | Hazard risk map, safest buildable sites, composite index geoTIFF |
| Web layers | `src/utils/webtiles.py` | North-up EPSG:4326 geoTIFF and a PMTiles archive for the workbench drape |
| Dossier | `src/report.py` | `master_site_dossier.json`, the scorecard the app renders |
| Reports | `src/category_report.py` | Per-category HTML summary plus raster viewer |

## Structure

```text
main.py            CLI runner
worker.py          survey job worker (deployed)
src/config.py      AOI, CRS (UTM 35S), 30 m grid, AHP weights
src/fetch_data.py  WCS 2.1.0 acquisition from the DE Africa sandbox
src/engines/       water, minerals, soil, hazard
src/mcp/           MCP server definition and tools
src/utils/         raster I/O, terrain (sink fill, D8, TWI), spectral indices,
                   lineaments, Jenks classification, web tiles, KML/KMZ export
data/              cached rasters and external geological context
outputs/           maps, GeoJSON, CSV, KMZ, HTML
```

Credentials: `SUPABASE_SERVICE_ROLE_KEY` (claims jobs, writes deliverables), `DE_AFRICA_TOKEN`
(read-only WCS access), `SITESURVEYOR_STATE_DIR` (cached rasters). The worker never touches Auth,
sessions or wallets — see [AUTHENTICATION.md](../../AUTHENTICATION.md).

Every category also exports `.kmz` for Google Earth Mobile or Maps.me with ranked sites, scores and
field-verification instructions.

## Disclaimer

Automated Earth observation screening, not certified engineering. Output is probabilistic
potential, prospectivity and hazard zonation, and is **not** a replacement for on-site
hydrogeological (VES/ERT), geotechnical or assay verification. Ground truth before drilling,
excavation or capital expenditure.

## License

MIT — see [LICENSE](LICENSE).
