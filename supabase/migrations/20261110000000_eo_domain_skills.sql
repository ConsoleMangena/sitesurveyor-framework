-- Earth Observation domain-interpretation skills.
--
-- The EO survey lifecycle (questionnaire, quote -> confirm -> launch, status vs
-- result, claim ceiling) is already always-on in the agent system prompt
-- (_shared/ai-agent.ts). These rows add ONLY the per-domain dossier-reading
-- nuances that prompt omits: hazard inverse safety scoring, minerals
-- unscreenable commodities, seasonal depth-to-water, and soil land-capability
-- fields. Matching keyword->key router entries live in _shared/skills.ts;
-- without them selectSkills never inlines these rows.

insert into public.ai_skills (key, title, description, body, examples) values
(
  'eo-hazard-interpretation',
  'Reading hazard & site-safety results',
  'hazard flood safety slope landslide buildable risk inundation safety score',
  'Read hazard findings from get_satellite_survey_result. The actionable number is hazard_safety.safety_score - HIGHER MEANS SAFER (hazard is scored inverse to the other domains); report it with hazard_class. Summarise flood/slope screening and the safest buildable targets. Never invert the safety score or present a high hazard index as a good outcome. Respect claim_ceiling.',
  '[{"prompt":"Is this site safe to build on?","tools":[{"name":"get_satellite_survey_result","args":{}}],"result":"safety_score 0.72 (higher = safer), hazard_class low; reported flood/slope screening and buildable targets."}]'
),
(
  'eo-minerals-interpretation',
  'Reading mineral prospectivity results',
  'mineral minerals prospectivity commodity gold copper alteration indicated unscreenable exploration',
  'Read mineral findings from get_satellite_survey_result. Report indicated mineral_commodities (name, group, confidence, map_share_pct, area_top_decile, target_score) and the dominant mineral. Always name unscreenable_commodities with their reason/needs - the sensor set cannot screen every commodity, so do not imply a clean bill of health for them. Scores rank investigation priority within this area, not grade, tonnage or a reserve; respect claim_ceiling and score_basis.',
  '[{"prompt":"Interpret the mineral prospectivity results.","tools":[{"name":"get_satellite_survey_result","args":{}}],"result":"Indicated copper + gold with map share; named unscreenable commodities and what they need. Priority within area, not grade/tonnage."}]'
),
(
  'eo-water-interpretation',
  'Reading groundwater & borehole results',
  'groundwater borehole water aquifer depth to water drill targets wet dry season',
  'Read groundwater findings from get_satellite_survey_result. Report water_depth.depth_to_water_wet_m and depth_to_water_dry_m as a seasonal range, the borehole_read, the groundwater cell_score/class, and ranked drill targets (rank, lat/lon, distance_km). Scores rank investigation priority inside this survey area only - never promise a guaranteed yield or absolute water presence. Respect claim_ceiling.',
  '[{"prompt":"What did the groundwater survey find?","tools":[{"name":"get_satellite_survey_result","args":{}}],"result":"Depth-to-water 8 m (wet) / 14 m (dry), borehole_read favourable; 3 ranked drill targets. Priority within this area only."}]'
),
(
  'eo-soil-interpretation',
  'Reading soil & land-capability results',
  'soil land capability agriculture agri crop erosion suitability fertility farm',
  'Read soil/land findings from get_satellite_survey_result. Report the soil_land cell_score/class, agricultural suitability and erosion risk from the dossier, plus ranked targets. Scores rank priority within this survey area only - do not promise crop yields. Respect claim_ceiling.',
  '[{"prompt":"How suitable is this land for crops?","tools":[{"name":"get_satellite_survey_result","args":{}}],"result":"soil_land cell_score 0.61 (moderate); reported suitability and erosion risk. Priority within area, not a yield promise."}]'
)
on conflict (key) do nothing;