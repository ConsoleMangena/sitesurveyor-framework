# SiteSurveyor AI — Platform & MCP Server Plan (v2)

**Project**: SiteSurveyor AI · **Organization**: Eineva Labs
**Date**: 2026-11-05 · **Status**: Planning · **Supersedes**: v1 (10-category monolith plan)

**What v2 changes**

1. The product is redefined as **an MCP tool surface for AI agents**, not a survey script that also exposes MCP. Tools are composable GIS primitives the model can reason over, not four black-box engines that return file paths.
2. Every capability is now classified against the **verified Digital Earth Africa WCS catalog** (48 coverages, read live from `GetCapabilities`/`DescribeCoverage` on 2026-11-05). v1 assumed ASTER, MODIS, VIIRS, Sentinel-1 and OSM as if they were on tap. Some are; several are not.
3. Adds the missing engineering layer: async jobs, per-job isolation, token-budgeted responses, error taxonomy, provenance, and a validation ledger.
4. Adds a Phase 0 that fixes the defects which make the current build unsafe to expose to a model or a client at all.

---

## 1. Product definition

A **geospatial analysis server for AI models**. An agent (Claude, Cursor, ChatGPT, or a vertical app) asks questions about a location in Africa; SiteSurveyor acquires Earth-observation data, computes analysis layers, and returns structured evidence the agent can reason about and cite. The human-facing report is one output of that surface, not the purpose of it.

**Input**: a point, a radius, or a **polygon** (parcel / farm boundary / claim). Polygon input is added in v2 — a site surveyor's real input is a cadastral boundary, and point+radius is why current results ignore shape.

**Output**: machine-readable evidence (values, rasters-as-references, uncertainty, provenance) plus optional rendered artifacts (map, KMZ, PDF) behind download URLs.

**Non-goals** (v1 drifted into all of these)

- Not a replacement for a geophysical survey, assay, soil laboratory, or professional engineering sign-off.
- Not a general GIS. No digitising, topology editing, or cartographic production house.
- Not a real-time/monitoring platform. Analysis latency is minutes; nothing here is streaming.
- Not global. DE Africa WCS serves roughly lon −30…66, lat −56…41. Outside that, the correct answer is `out_of_coverage`, not a degraded guess.

---

## 2. Design principles for an MCP-first surface

These are the rules that make the difference between "MCP added on" and "actually usable by a model".

| # | Principle | Consequence |
|:--|:----------|:------------|
| P1 | **Primitives, not products** | Expose `slope`, `twi`, `ndvi_timeseries`, `lineaments`, `score`, `rank_sites` separately so the agent can build and interrogate an analysis instead of trusting one call. |
| P2 | **Discovery before execution** | `list_layers` / `describe_layer` / `check_coverage` are cheap and synchronous. The agent plans against what actually exists for its geometry and date before asking for compute. |
| P3 | **Self-describing evidence** | Every value carries units, EPSG code, source dataset + timestamp, processing version. A number without provenance cannot be cited and should not be returned. |
| P4 | **Async for anything >5 s** | `job_id` + `get_job` with progress and partial results. A model must never hold a tool call open for four minutes, and a timeout that discards a completed run is the worst outcome. |
| P5 | **Token budget is a first-class constraint** | Default `detail="brief"`, capped `max_items`, no base64 inside JSON, rasters returned as references not pixels. A 200 KB tool response degrades the agent's reasoning more than a missing layer would. |
| P6 | **Errors the model can act on** | Typed reasons (`out_of_coverage`, `no_data_in_period`, `layer_unavailable`, `quota_exceeded`, `invalid_geometry`) with a suggested next call. A raw Python traceback in `detail` (current [src/api.py:174](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/api.py#L174)) gives the agent nothing and leaks internals. |
| P7 | **Never silently substitute data** | If a requested layer is missing, say so and degrade *explicitly*. Current behaviour swaps in a different proxy with different units ([src/engines/hazard.py:99-100](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/engines/hazard.py#L99-L100)) — undetectable by the agent. |
| P8 | **Claim ceiling travels with the result** | Each response states the strongest defensible claim ("prioritisation only; no yield, grade, or legal assertion") and the agent must restate it. This is how the product avoids the "precision borehole" failure mode. |
| P9 | **Bounded tool count** | ~15 tools with rich parameters, not 60 micro-tools. Past that, agent tool-selection accuracy drops, and you pay for it in every conversation. |
| P10 | **Determinism** | Same params + same data version ⇒ same output. No RNG reseeding inside library calls ([src/utils/classification.py:28](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/utils/classification.py#L28)); no per-AOI percentile stretching masquerading as an absolute score. |

---

## 3. Verified service constraints

Confirmed against the live WCS on 2026-11-05. Design around these; don't discover them in production.

- **Service**: `https://ows.digitalearth.africa/wcs`, WCS 2.0.1/2.1.0, 48 coverages.
- **Formats**: `image/geotiff`, `application/x-netcdf` only. No COG, no tiles, no vector output.
- **CRS the service will serve**: **EPSG:3857, EPSG:4326, EPSG:6933**. Arbitrary UTM zones are *not* offered. The existing design — download in the coverage's native CRS, warp locally to the site's UTM grid ([src/config.py:160-191](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/config.py#L160-L191)) — is therefore **correct and should be kept**. Native CRS differs per coverage (4326 for ALOS/S1/DEM/CHIRPS/WSF, 6933 for GeoMAD/WOfS/FC/WorldCereal, 3857 for Landsat SR/ST), so axis subsetting (`Lat/Long` vs `x/y`) must be resolved per coverage from metadata rather than hardcoded.
- **Band indices are provider-side properties.** Verified orderings:

| Coverage | Bands (1-based, in order) |
|:--|:--|
| `wofs_ls_summary_alltime` | `count_wet`, `count_clear`, `frequency` |
| `gm_s2_annual` | blue, green, **red(3)**, red_edge_1-3, **nir(7)**, nir_narrow, **swir_1(9)**, **swir_2(10)**, smad, emad, bcmad, count |
| `fc_ls_summary_annual` | pv 10/50/90(1-3), npv 10/50/90(4-6), bs 10/50/90(7-9), count_valid(10) |
| `alos_palsar_mosaic` | hh, **hv(2)**, **mask(3)**, date, linci |
| `s1_rtc` | vv, vh, **angle(3)**, area, **mask(5)** |
| `s2_l2a` | coastal_aerosol, blue, green, red, red_edge_1-3, nir, nir_narrow, water_vapour, swir_1, swir_2, AOT, SAWV, mask |
| `ls8_sr` / `ls9_sr` | blue, green, red, nir, swir_1, swir_2, pq, aerosol_level |
| `ls8_st` / `ls9_st` | st, st_qa, pq |
| `srtm_deriv` | slope, mrrtf, mrvbf |
| `ndvi_anomaly` | ndvi_std_anomaly, ndvi_mean, clear_count |
| `wq_annual` | fai, hue, ndvi, owt, CHLA, clear_water, st_max, st_median, st_min, TSI, TSM, water_mask |
| `wsf_evolution` | wsfevolution, idc_score |
| `io_lulc_v2` | supercell (11-class LULC, time-selectable) |
| `crop_mask` | **mask(1)**, **prob(2)**, filtered(3) |
| `dem_cop_30` | elevation |
| `esa_worldcover_2021`, `esa_worldcereal_*` | classification |

  **Correction to the earlier code review**: the hardcoded indices in use *are* right — WOfS band 3 = `frequency`, the GeoMAD 3/7/9/10 reads, ALOS band 2 = `hv`, FC 6/8 = `npv_pc_90`/`bs_pc_50`, and `crop_mask` band 2 = `prob` all verify against a live DescribeCoverage. The requirement is still to resolve bands **by name**, because those orderings are the provider's to change.
  The FC comment that claimed "band 5 = NPV median" while the code read band 6 has been corrected in [src/engines/hazard.py:98](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/engines/hazard.py#L98) and [src/engines/soil.py:140](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/engines/soil.py#L140) — comment was wrong, code was right.
- **Quality flags that exist and are ignored**: ALOS `mask`, S1 `mask`, S2 `mask`, Landsat `pq` / `st_qa`, FC `count_valid`(10), WOfS `count_clear`/`count_wet`, GeoMAD `count`(14), `ndvi_anomaly` `clear_count`. These are the cloud/no-data guards that would explain the NaN halos reaching the score. Fetching them is cheaper than inferring validity from the data values themselves.
- **Single-date mosaics**: `alos_palsar_mosaic` (2007) and `jers_sar_mosaic` (1992-98) are fixed stamps — structure, not change detection or SAR time-series texture.
- **Resolution floor**: nothing finer than ~10 m optical / 30 m SAR-DEM; CHIRPS is ~5.5 km. Any deliverable claiming metre-scale siting must state its own uncertainty radius.
- **Not on this service** (source elsewhere or descope): ASTER TIR, MODIS, VIIRS nightlights, S2 level-1C radiance, lithology/structural maps, borehole registers, soil laboratory grids, cadastral parcels, OSM, protected-area polygons, transaction/price data.

---

## 4. MCP tool surface (target design)

`transport`: **stdio** for local agents, **Streamable HTTP** for cloud (SSE is the legacy path in the MCP spec — keep it only for compatibility). Heavy handlers are `async` and delegate to a worker; nothing long-running executes inside the request path.

### T0 — Discovery (sync, <300 ms)

| Tool | Returns |
|:--|:--|
| `list_layers(theme?, region?)` | coverage ids, theme, native CRS, resolution, temporal extent, bbox |
| `describe_layer(layer_id)` | band names + units, nil values, native CRS, grid limits, valid timestamps |
| `check_coverage(geometry, layers, period?)` | availability per layer, tile/size estimate, expected latency + cost, and *why not* when unavailable |

### T1 — Acquisition (async, 10 s–5 min)

`fetch(geometry, layers, resolution?, period?, force?)` → `job_id`. Per-job workspace; content-addressed cache keyed on (coverage, version, geometry, period, resolution). Returns resolved band table plus the real post-warp resolution and valid-pixel fraction.

### T2 — Analysis primitives (async, 5 s–90 s each)

| Tool | Parameters | Notes |
|:--|:--|:--|
| `terrain` | dem_id, metrics: slope, aspect, hillshade, plan/profile curvature, flow_dir, flow_acc, **twi, csv, spi, sti, ltv**, ridge/valley flatness, **catchment_for(pour_point)** | Add the ε increment to sink filling; **buffer the DEM beyond the AOI** so accumulation isn't truncated at the border ([src/utils/terrain.py:103-106](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/utils/terrain.py#L103-L106)). `catchment_for` is new and unlocks flood, dam and mini-hydro honestly. |
| `spectral` | source_id, indices: ndvi, **ndre**, evi, ndmi, ndwi, mndwi, bsi, iron_oxide, hydroxyl, ferrous, **lst_anomaly**, **evaporative_fraction** | Red-edge (`s2_l2a`) and LST (`ls8_st`) are available and unused. Topographic illumination correction becomes mandatory before alteration mapping in hilly terrain. |
| `timeseries` | source_id, index, period, stat: median/peak/anomaly, **trend_slope + Mann-Kendall p**, **cv**, seasonal amplitude | The biggest methodological gap in v1 — everything was one static composite. |
| `surface_water` | method: wofs_frequency / gsw_seasonal / gsw_extents | Water-body polygons + permanence class, not a single scalar. |
| `sar_structure` | bands (vv,vh,hv), normalise with `angle`, texture (GLCM), backscatter segmentation, lineaments | Canny+Hough stays but is reported as *candidate* linear features with orientation rose, length distribution and a stated false-positive rate. |
| `classification` | breaks: jenks/manual, masks (water, built-up, cropland), **explicit nodata class** | No-data is its own class — never class 1, never class 5. |
| `external_context` | osm_distance(roads, power, water), wdpa_overlap, geology_faults, elevation_of_site | Clearly-labelled third-party sources, each with licence and staleness. |

### T3 — Combination (sync, <2 s)

`score(layers, weights, normalise, constraints[], method)` → score raster **plus** per-layer contribution, one-at-a-time weight perturbation (±50 %), the Spearman correlation matrix between inputs (exposes terrain collinearity), and the pixel count excluded by constraints.

- **Rename AHP.** It is a weighted linear combination until a pairwise matrix, eigenvector derivation and Saaty consistency ratio exist. Build those and the name is earned.
- **Constraints ≠ low weights.** Floodway, wetland buffer, protected area, upslope contamination sources must *exclude*, not subtract. Fixes the defect where a saturated flood pixel is averaged away by a benign slope.

### T4 — Targeting (sync, <2 s)

`rank_sites(score_raster, k, min_spacing, exclusion_masks, geometry, uncertainty)` → candidates each with `uncertainty_radius_m` (from the coarsest influential layer and local gradient), cluster evidence (neighbouring pixel statistics, not one cell), and travel-surface distance where an access cost surface exists.

### T5 — Delivery (async)

`build_report(job_id, sections[], format: json|html|pdf|kmz|geojson|tif)` → download URLs. `get_job` for status, progress, partial results, artifacts. `list_jobs`, `delete_job` for lifecycle.

### T6 — Feedback (sync)

`record_outcome(job_id, kind: borehole_yield|assay|soil_test|construction|crop, observed, source)` → validation ledger. The only route to a calibrated product, and nearly free to add early.

---

## 5. Response contract

One envelope for every analysis so the agent relies on structure instead of prose.

```json
{
  "status": "success",
  "job_id": "sj_01H...",
  "geometry": { "crs": "EPSG:32735", "cell_m": 30, "shape": [800, 800] },
  "result": { "target_cell": { "value": 61.4, "unit": "index_0_100_relative" } },
  "provenance": [
    { "layer": "gm_s2_annual/red", "source": "DEA WCS", "period": "2023", "crs": "EPSG:6933",
      "resampled_from_m": 10, "bands_resolved_by": "name" }
  ],
  "data_quality": { "valid_pixel_fraction": 0.93, "nodata_pixels": 13120, "coarse_layers": ["rainfall_chirps_monthly"] },
  "confidence": { "level": "moderate", "dominant_limitation": "no field validation for this AOI" },
  "uncertainty": { "spatial_resolution_m": 30, "effective_targeting_radius_m": 1100 },
  "claim_ceiling": "Prioritisation of investigation sites only. Not a statement of water yield, mineral grade, or buildability.",
  "score_basis": "relative_to_aoi_percentile",
  "sensitivity": { "weights_perturbed_50pct_rank_stability": 0.71 },
  "artifacts": [ { "kind": "tif", "url": "...", "bytes": 1840000 } ],
  "next_recommended_calls": ["check_coverage", "external_context"]
}
```

`score_basis` is mandatory: `absolute_scale` or `relative_to_aoi_percentile`. The current pipeline only produces the latter while the dossier prints `x/100` as if it were the former — an agent will otherwise tell a client that two sites "scored 76 and 41" when the numbers aren't comparable.

---

## 6. Domain analyses — with feasibility status

Legend: **A** = computable from DEA WCS today · **B** = needs a named external source · **C** = not feasible, descoped.

### Water (Cat 1)
| Capability | Status | Basis |
|:--|:--|:--|
| Fracture/lineament density + orientation | A | ALOS `hv`+`mask`, S1 RTC `vv/vh/angle`, DEM hillshade |
| TWI, flow accumulation, drainage density | A | after sink-fill ε fix and AOI buffering |
| Recharge context (rainfall, seasonality) | A | CHIRPS monthly from 1981 → SPI, wet/dry ratio |
| Vegetation moisture/productivity | A | GeoMAD + `ndvi_anomaly` + `io_lulc_v2` |
| Perennial vs seasonal groundwater proxy | A | multi-year dry-season NDMI/NDWI from the GeoMAD archive |
| **Spring / wetland discharge** | A | LST (`ls8_st`) + NDWI + TWI convergence — replaces the MODIS assumption |
| **Dam & weir siting** | A | `catchment_for` + valley bottleneck + storage:wall ratio |
| **Surface-water quality near the site** | A | `wq_annual` TSM / CHLA / TSI — new, high client value, no new plumbing |
| Contamination exclusion buffers | B | needs latrine/kraal/cemetery locations → OSM + client survey points |
| Regolith / weathering thickness | C | not derivable at these resolutions; expert overlay only |
| Borehole yield prediction | B | needs a national/District borehole register; until then, ranking only |

### Minerals (Cat 2)
| Capability | Status | Basis |
|:--|:--|:--|
| Iron oxide / hydroxyl / ferrous alteration | A | `gm_s2_annual` or `s2_l2a`, bands resolved by name |
| Structural density, intersections, strike rose | A | lineaments + orientation clustering (already computed, currently unused) |
| **Terrain flatness for alluvial traps** | A | `srtm_deriv` `mrvbf`/`mrrtf` — purpose-built geomorphic derivatives, unused today |
| Vegetation residual correction | A | NDVI regression |
| Quartz/silica & thermal mineralogy | **C** | needs ASTER TIR, which DE Africa does not host — v1 promised this |
| Known-deposit / endowment context | B | USGS MRDS + national geology; report record completeness as a limitation |
| Lithology-controlled prospectivity | B | national geological map access; no DEA equivalent |
| Grade or tonnage | C | never — assay only |

### Soil & land (Cat 3)
| Capability | Status | Basis |
|:--|:--|:--|
| Spectral soil proxies (moisture, OC, colour) | A | bare-soil pixels only; disclose as proxy |
| **Actual soil properties** | **B, new** | **ISRIC SoilGrids**: texture, pH, OC, CEC, rooting depth, drainage class (~250 m). v1 built a whole "soil capability" category without a single soil measurement — this is the highest-value addition in the plan. |
| Erosion | A+B | RUSLE needs R (CHIRPS-derived erosivity), K (SoilGrids), LS (DEM), C (FC), P (management). With SoilGrids, RUSLE is honest; without it, don't call it RUSLE. |
| Crop benchmark & validation | A | `esa_worldcereal_maize_main` / `_wintercereals` / `_activecropland` / `_irrigation` — independent cropland truth to score suitability against |
| Irrigation suitability | A+B | slope + water proximity (OSM/WSF) + WorldCereal irrigation extent |
| Frost hollows, waterlogging | A | DEM + inverted accumulation + SAR wet/dry backscatter difference |
| Salinity/sodicity, tenure, EIA category | B | national/provincial sources; tenure is legal data, not satellite data |

### Vegetation, biomass & carbon (Cat 4)
| Capability | Status | Basis |
|:--|:--|:--|
| Productivity trend & degradation | A | `ndvi_anomaly`, `ndvi_climatology_ls`, GeoMAD series with Mann-Kendall |
| Woody cover / bush encroachment | A | `io_lulc_v2` annual classes + S1 VH texture — exactly what this category lacked |
| Carrying capacity | A+B | NDVI × rainfall, calibrated to published stocking rates |
| AGB / carbon stock | B | allometry needs field calibration; 2007 L-band HV alone will not give defensible tCO₂/ha for a carbon transaction |
| Burn history & fire scars | A | NBR differencing across `gm_ls8_ls9_annual` / `gm_s2_annual` years |
| LDN / SDG 15.3.1 | A+B | framework layers exist; official reference data needed for reporting |

### Hazard (Cat 5)
| Capability | Status | Basis |
|:--|:--|:--|
| Flood | A | WOfS/GSW persistence + buffered catchment accumulation + channel morphology — labelled *surface-water persistence*, not design-event inundation |
| Design flood / return period | B | needs a hydrological model and survey-grade DEM; not offered |
| Slope failure | A→B | infinite-slope with cohesion/friction/saturation needs soil + lithology; slope-only must read "slope steepness proxy", not landslide risk |
| Wildfire | A | FC `npv` peak + live fuel moisture (NDMI) + slope/aspect + seasonality; add ignition/road proximity |
| Drought | A | CHIRPS SPI-3/6/12 + NDVI anomaly — replaces the single static rainfall mean |
| Liquefaction, karst/sinkhole | A (low confidence) | flat alluvial + moisture proxy; circular depression detection; both are screens |
| Seismic proximity | B | USGS/PGF catalog; not on DEA |
| **Constraint / legal risk** | **B, new** | WDPA protected areas, forest reserves, wetland buffers, EMA-listed EIA triggers. Its absence is a product gap for someone buying land, not merely a data gap. |

### Infrastructure, property, energy, urban (Cat 6-8, 10)
| Capability | Status | Basis |
|:--|:--|:--|
| Cut-and-fill volumes, platform earthworks | A | DEM + polygon; genuinely computable and billable |
| Least-cost access route + gradient profile | A+B | DEM cost surface; road network from OSM |
| Line-of-sight / viewshed | A | DEM viewshed, add 10 m sensor height |
| Solar insolation & shading | A+B | DEM aspect + NASA POWER/GEE for GHI — imagery cannot measure irradiance |
| Wind exposure | A | ridgeline/TPI proxies only; a resource claim needs met mast or reanalysis |
| Mini-hydro head × catchment | A | `catchment_for` + gradient + runoff coefficient |
| Built-up & settlement growth | A | `wsf_2015/2019/evolution` at 10 m + WorldCover — replaces v1's VIIRS assumption with data that exists |
| Urban heat island / LST anomaly | A | `ls8_st`/`ls9_st` with `st_qa` filtering |
| Service-access gaps | B | clinics/schools/water points from OSM or national registries |
| Land valuation | B/C | needs transaction data; a hedonic model from satellite proxies alone will be confidently wrong |

### Conservation (Cat 9)
Habitat suitability, corridor connectivity, wetland change and HWC frontiers become **A/B** with `io_lulc_v2` + WOfS + DEM + WDPA. Poaching-pressure proxies stay B (needs patrol/incident data). None of it substitutes for a species survey.

---

## 7. Runtime architecture

```
Agent ──MCP (stdio | streamable HTTP)──► API process  (thin: validate, enqueue, return job_id)
                                              │
                                              ▼
                                    Job store (sqlite/postgres)
                                              │
                                              ▼
                          Worker pool (CPU-bound raster processes)
                                              │
              ┌───────────────────────────────┼───────────────────────┐
              ▼                               ▼                       ▼
   Cache (content-addressed,        Per-job workspace          Validation ledger
   keyed on layer+version+geom)     /jobs/{id}/  ← isolated     outcomes + calibration
              │                               │
              ▼                               ▼
        DE Africa WCS                  Artifact store (signed URLs, size-capped)
                                            │
                                            ▼
                                     Web preview (Leaflet / OGC features)
```

Required properties:

- **No mutable global configuration.** Replace `set_target_site()` module globals ([src/config.py:125-204](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/config.py#L125-L204)) with an immutable `SiteContext` passed explicitly. This is what removes cross-request overwrite and makes `--workers 2` survivable.
- **Per-job output isolation** — fixes [src/config.py:31](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/config.py#L31) with [src/api.py:145](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/api.py#L145).
- **Windowed raster IO** — no whole-array reads ([src/utils/raster.py:31-36](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/utils/raster.py#L31-L36)); read only the requested bbox at the requested resolution; replace the pure-Python D8 heap loop with `pyflwdir`/`richdem` so a 20 km AOI takes seconds, not minutes.
- **Explicit nodata propagation** — every helper states its NaN contract; a NaN never enters a score, class, or statistic without being counted and reported in `data_quality`.
- **Band resolution by name** — one cached `DescribeCoverage` per layer.
- **Reprojection policy** — nearest for classifications, bilinear/cubic for continuous, and **not** bilinear for a DEM feeding slope/TWI where it smooths the signal; the current default is bilinear ([src/utils/raster.py:16](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/utils/raster.py#L16)).
- **Geometry validation** — reject out-of-coverage, self-intersecting or absurd-area inputs before compute; cap AOI area and cell count with a returned error rather than a hang.
- **Cost & latency budget per tool**, enforced server-side and surfaced in `check_coverage` so the agent chooses knowingly.

---

## 8. Scientific-integrity requirements

The product's risk is not that the math is wrong — it's that the language outruns it. These are spec, not style.

1. **Three-tier claim labels** on every capability: *observed* (sensor-measured), *derived* (computed from observed), *inferred* (indicative of something unmeasured). Canopy-index "soil capability" is tier 3 and must read that way.
2. **Nodata is never evidence.** No `nan_to_num(..., 0.0)` in a scoring path ([src/engines/hazard.py:82](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/engines/hazard.py#L82)); masked pixels are excluded and counted. Fix the digitize-NaN path first — missing data currently classifies as "Very High".
3. **Relative scores are labelled relative**; cross-site comparison requires a fixed absolute normalisation with documented reference statistics.
4. **Weights are versioned artefacts** with a stated derivation, a consistency check if AHP is claimed, and a sensitivity report on every composite. The same index cannot be +0.08 water, +0.18 soil and +0.15 hazard-fuel without saying so.
5. **Validation is a feature.** Before any accuracy marketing: assemble known outcomes (borehole yields, mapped deposits, sampled soils), hold out geographically separate sites, report hit-rate and precision/recall per class, re-run on every weight change. `record_outcome` + the ledger make this compound.
6. **Reproducibility**: params hash and data versions in every response; no global RNG reseeding; same inputs ⇒ same outputs.
7. **Method honesty**: no model name (AHP, RUSLE, USLE, SPI, Crosta PCA, SDG 15.3.1) unless the published method is implemented end-to-end.

---

## 9. Security & operations

- **Authn/authz on every data path** — done, by removing the path. The engine listens on nothing: the FastAPI surface (`/api/*`, `/outputs/*`, the sandbox page) is deleted from this copy, and a survey only ever arrives as a `survey_runs` row that the `satellite-survey` edge function wrote after authenticating the user, checking workspace membership and charging credits. Deliverables go to a private Storage bucket and are read through short-lived signed URLs minted per click, so no filename guess opens another client's report.
- **CORS** — moot, and deleted with the API. There is no browser-origin caller of the engine, so there is no allow-list to maintain or misconfigure.
- **Secrets**: testing against a live key is your call. Two facts worth holding — the value stays readable in git history after the file is cleaned, so revocation rather than removal is the fix; and if that PAT is reused by other pipelines, revoking it breaks them too. Placeholder in repo, secret in Render env, is the shape to return to when testing ends.
- **Error hygiene**: typed codes to clients, tracebacks logged server-side against `job_id`.
- **Quota & abuse**: per-key rate limits, per-request compute ceilings, and respect for the fact that the upstream WCS is a shared research service.
- **Observability**: structured logs keyed by job, per-stage timing, upstream WCS failure rate, cache hit rate, per-tool token footprint.
- **Agent evaluation harness**: scripted scenarios scored for tool-selection accuracy, refusal of out-of-coverage requests, and whether the model reproduces the claim ceiling. Without this, "the agent will use it well" is a guess.
- **Data licences**: DE Africa products carry attribution terms, and ESA WorldCover/WorldCereal, USGS, OSM (ODbL), WDPA and SoilGrids each differ. Ship an attribution block per report.

---

## 10. Roadmap with acceptance criteria

**Phase 0 — make it safe to run at all** *(no new capability)*
Fix and prove: NaN→"Very High" classification; `nan_to_num` no-data-as-zero-evidence in hazard/lineaments; sink-fill ε + DEM buffering + consistent filled/unfilled TWI; per-job workspace and immutable `SiteContext`; auth on artifact paths; band resolution by name; a `pytest` suite with golden rasters for terrain/spectral/classification, plus a concurrency test that runs two AOIs in parallel and asserts neither result is contaminated.

*Status — scoring integrity landed (59 passing, 2 xfail-red-line tests in `tests/`)*:
- No-data is no longer evidence: class 255 for unobserved cells, NaN carried through `robust_norm`/`fmax`/weighted sums, `null` instead of bare `NaN` in JSON, gray voids with a legend entry on every map.
- Terrain/hydrology: ε-flood removes false pits on plateaus, void-rim seeding stops valid ground behind a hole being drained, accumulation is NaN inside voids, negative TWI retained, and the `np.gradient` stencil now voids cells touching a hole (a lone DEM void used to read as "flat, infiltrative").
- SAR structure: edges suppressed along void boundaries, lineament/intersection/drainage densities divided by *observed* area and NaN below 34% coverage.
- Determinism: `residual_index` samples evenly through NDVI order instead of drawing a fresh random subsample per run; Hough seeded.
- Provenance honesty: "layer integrated" is now derived from successful use (plus the error string), not from a file existing; the dossier reports `not_run` vs `unreadable (...)`; a survey with no candidates no longer crashes the dossier or the report renderer.
- Spectral: void scenes produce NaN without 0/0 warnings flooding the log; an under-populated detrend returns no-data rather than passing the raw ratio through mislabelled as a residual.
- Honesty must not erase the answer: making no-data NaN let `uniform_filter(dem, size=15)` poison *every* window on a grid with a few percent DEM holes (225 cells per window, so one hole in 30 is enough), and because the composite is a NaN-propagating weighted sum, one dead layer voided the entire mineral index — 96% "No data", `nan` target, zero candidates, and a report that looked like a genuine "no prospectivity here". The neighbourhood mean is now taken over observed cells only (`local_relief`), and that survey scores 23.8/100 with 8 targets on the same data. Any new filter over a NaN-bearing array needs the same treatment; the boolean-mask filters in `lineaments`/`terrain` were already safe.

*Still open in Phase 0*: immutable per-job `SiteContext` + namespaced output directory (`tests/test_site_isolation.py` documents the two collisions as strict xfail), band resolution by name, artifact-path auth, golden-raster fixtures, and the terrain cost below.
**Performance item**: `fill_sinks` 6.74 s + `d8_flow` 3.35 s on an 856×901 grid — ~10 s per DEM pass, and `water.py` was routing flow twice before the fix. A worker pool sizing and any `terrain` tool latency budget must use this, not a per-pixel estimate.
**Memory budget** (`tools/measure_rss.py`, one survey per process, warm data): the export stage owns the peak, and the peak is the map render buffer, which scales with output megapixels — `savefig` dpi, not dtype or resampling method. A mineral survey peaked at 582 MB with maps at 200 dpi and 427 MB at 120; the import floor is 111 MB and the analysis steady state 270–330 MB. That is why `MAP_DPI` is a single config knob (default 120, because that is what fits the starter instance; raise it by environment variable as the instance grows) instead of sixteen hardcoded literals, and why the worker pool cannot be sized by counting CPUs: N workers is N × one survey's peak, so the per-job `SiteContext` and the memory ceiling have to be settled together. A service created with the CLI gets no env vars from `render.yaml`, which is why that number lives in code.
**Done when**: regression and concurrency tests pass, and no `except: pass` remains in a scoring path.

**Phase 1 — MCP surface v2 (discovery + primitives + async)**
T0 + T1, `terrain`/`spectral`/`classification` as separate async tools, `score`/`rank_sites` with constraints and sensitivity, response envelope, `get_job`. stdio + Streamable HTTP.
**Done when**: an agent given only the tool list independently produces a correct water-screening answer for a new coordinate, refuses an out-of-coverage point, and the exchange fits a defined token budget.

**Phase 2 — time series + data that already exists but is unused**
`timeseries`, LST/evaporative stress, `wq_annual`, `io_lulc_v2`, `wsf_evolution`, `srtm_deriv`, `ndvi_anomaly`/`ndvi_climatology`, full CHIRPS SPI, FC percentiles with validity counts. Polygon input.
**Done when**: drought, vegetation-trend and water-quality answers come from real multi-date evidence with dates in the provenance block.

**Phase 3 — external context, legal & physical due diligence**
SoilGrids, geology/faults, MRDS, OSM access distances, WDPA/reserve/wetland constraints, tenure/EIA screening, each stamped "third-party, licence, staleness".
**Done when**: constraint layers *exclude* rather than penalise, and every report lists the legal/administrative checks that could not be performed.

**Phase 4 — validation & calibration**
Ledger populated from client outcomes; held-out tests; per-class precision/recall; weights re-derived or replaced by a supervised model where data supports it; published accuracy with confidence intervals.
**Done when**: at least one category states a measured hit-rate against its pre-validation heuristic.

**Phase 5 — remaining categories & delivery**
Energy (NASA POWER/GEE), infrastructure (cut-and-fill, least-cost access, viewshed), conservation and urban categories, report polish, vector tiles or web preview for humans.

Rule inherited from v1 and kept: **no new category reaches the public surface until the preceding phase has measurable validation.**

---

## 11. Descoped, with reasons

| v1 item | Decision |
|:--|:--|
| ASTER TIR silica/quartz (2.6) and thermal mineralogy (2.8) | Drop — not hosted; needs a different provider |
| MODIS / VIIRS nightlights (7.4, 8.4, 10.6) | Replace with WorldCover + WSF + `io_lulc_v2` |
| True ATI needing day+night thermal (1.12) | Replace with LST anomaly + evaporative fraction from `ls*_st` |
| "Precision" borehole siting, grade/tonnage, valuation figures | Re-label as prioritisation; no numeric claim without validation |
| AHP as the stated method | Re-label as weighted linear combination until properly constructed |
| Supervised ML across categories | Behind Phase 4 — the training labels don't exist yet |
| Cropland download wired but unused ([src/fetch_data.py:185-188](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/fetch_data.py#L185-L188)) | Resolved — `crop_mask` band 2 (`prob`) now feeds Cat 3 capability at [src/engines/soil.py:214](file:///C:/Users/BizIntel/Documents/sitesurveyorai/src/engines/soil.py#L214), with `fmax` so a missing cropland or FC layer does not void the other |

---

## 12. Decisions and remaining questions

**Decided (2026-11-05):**

1. **Primary consumer** — your own app plus your own agents. Consequence: one shared bearer key, *not* public multi-tenant auth. Phase 0 auth work is hours: reject unauthenticated calls, stop serving `/outputs/*` by guessed filename, and keep the key out of the repo. Multi-tenant keys, quotas and per-tenant billing are descoped until there is an external consumer.
2. **Isolation model** — own VPS, one API process plus a worker pool. Consequence: the worker pool is the unit of concurrency, so the module-global `src.config` in §10 must become an immutable per-job `SiteContext` *before* a second worker exists; today two workers would corrupt each other's AOI mid-survey.
3. **Geometry** — point + radius now, polygon in Phase 2. Consequence: `check_coverage` and every analysis tool take `{lat, lon, radius_m}`; the `geometry` argument stays in the tool signature so Phase 2 adds a variant rather than a breaking change.
4. **Validation data** — none obtainable yet. Consequence: build the `record_outcome` ledger now so evidence starts accumulating against a defined schema, and keep every claim ceiling in §8 (no hit-rates, no "precision" siting) until Phase 4 has something to measure.

**Still open:**

5. **Licence** — README claims Proprietary ([README.md:139](file:///C:/Users/BizIntel/Documents/sitesurveyorai/README.md#L139)) while MIT is committed at root. Settle before publishing an endpoint others integrate with.
6. **DE Africa credential** — the key currently in the repo is a temporary test key you will revoke after testing. Two facts to keep in view: revocation is the fix, not editing the file, because the value stays readable in git history; and a shared PAT would break other pipelines, so the replacement goes in the VPS environment, not the repo.

---

*SiteSurveyor AI — Eineva Labs — screening evidence for ground decisions*
