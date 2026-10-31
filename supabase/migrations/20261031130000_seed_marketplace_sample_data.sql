-- Sample public marketplace content: a dedicated sample market workspace with
-- instrument listings, accessories, professionals, jobs, firms, and training
-- events, each with coordinates so they appear on the public globe.
--
-- Idempotent: fixed UUIDs, ON CONFLICT DO NOTHING, and a sample auth account
-- whose workspace is reused on re-run. The sample account has no password and
-- cannot sign in; it only owns the directory rows.

do $$
declare
  v_user_id uuid := 'e1000000-0000-4000-8000-000000000001';
  v_workspace_id uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (
    v_user_id,
    'sample-market@sitesurveyor.market',
    now(),
    '{"full_name": "SiteSurveyor Sample Market", "account_type": "business", "workspace_name": "SiteSurveyor Sample Market"}'::jsonb
  )
  on conflict (id) do nothing;

  select id into v_workspace_id
  from public.workspaces
  where owner_user_id = v_user_id
  order by created_at
  limit 1;

  if v_workspace_id is null then
    insert into public.workspaces (id, name, slug, type, owner_user_id)
    values (
      'e0000000-0000-4000-8000-000000000001',
      'SiteSurveyor Sample Market',
      'site-surveyor-sample-market',
      'business',
      v_user_id
    )
    on conflict (id) do nothing;

    select id into v_workspace_id
    from public.workspaces
    where id = 'e0000000-0000-4000-8000-000000000001';
  end if;

  insert into public.marketplace_listings
    (id, workspace_id, name, type, condition, price, currency, seller, location,
     description, specs, is_global, listing_type, category, latitude, longitude)
  values
    ('e2000000-0000-4000-8000-000000000001', v_workspace_id,
     'Leica TS16 1" Total Station', 'Total Station', 'Like New', 12500, 'USD',
     'Harare Geomatics Ltd', 'Harare, Zimbabwe',
     'Two years old and calibrated quarterly. Includes GRZ4 tripod, prisms, and hard case.',
     ARRAY['1" angular accuracy', '1000 m reflectorless', 'Captivate onboard'], true,
     'sale', 'instrument', -17.8252, 31.0335),

    ('e2000000-0000-4000-8000-000000000002', v_workspace_id,
     'Trimble S7 Robotic Total Station', 'Total Station', 'Good', 18900, 'USD',
     'Bulawayo Survey Works', 'Bulawayo, Zimbabwe',
     'Robotic one-person setup with Trimble Access and tracking target included.',
     ARRAY['1" accuracy', 'MagDrive servo', 'Long-range FineLock'], true,
     'sale', 'instrument', -20.1530, 28.5799),

    ('e2000000-0000-4000-8000-000000000003', v_workspace_id,
     'Topcon GT-600 Total Station (Hire)', 'Total Station', 'Like New', 95, 'USD',
     'Nairobi Survey Supply', 'Nairobi, Kenya',
     'Weekly hire with prism, tripod, and field controller. Delivery within Nairobi.',
     ARRAY['1" accuracy', 'Hybrid positioning', 'Weekly rate'], true,
     'hire', 'instrument', -1.2864, 36.8172),

    ('e2000000-0000-4000-8000-000000000004', v_workspace_id,
     'Trimble R12i GNSS Receiver Kit', 'GNSS Receiver', 'New', 18900, 'USD',
     'Harare Geomatics Ltd', 'Harare, Zimbabwe',
     'Latest R12i with TSC7 controller, Trimble Access licence, and base-rover radios.',
     ARRAY['672 channels', 'Trimble ProPoint', 'IP65'], true,
     'sale', 'instrument', -17.8252, 31.0335),

    ('e2000000-0000-4000-8000-000000000005', v_workspace_id,
     'Leica GS18 T Smart Antenna (Hire)', 'GNSS Receiver', 'Like New', 85, 'USD',
     'Cape Town AeroSurvey', 'Cape Town, South Africa',
     'Tilt-compensated rover available for daily or weekly hire, courier nationwide.',
     ARRAY['True tilt up to 30 degrees', 'RTK and network RTK', 'Daily rate'], true,
     'hire', 'instrument', -33.9249, 18.4241),

    ('e2000000-0000-4000-8000-000000000006', v_workspace_id,
     'Emlid Reach RS3 Base + Rover Set', 'GNSS Receiver', 'New', 3450, 'USD',
     'Lagos Field Equipment', 'Lagos, Nigeria',
     'Complete RTK kit with LoRa radios, survey poles, and field software.',
     ARRAY['Multi-band GNSS', 'LoRa radio', 'IP67'], true,
     'sale', 'instrument', 6.5244, 3.3792),

    ('e2000000-0000-4000-8000-000000000007', v_workspace_id,
     'Sokkia B40 Automatic Level', 'Digital Level', 'Good', 780, 'USD',
     'Gaborone Instruments', 'Gaborone, Botswana',
     'Reliable site level, 32x magnification, recently serviced.',
     ARRAY['32x magnification', 'Compensator range plus/minus 15 arcseconds'], true,
     'sale', 'instrument', -24.6282, 25.9231),

    ('e2000000-0000-4000-8000-000000000008', v_workspace_id,
     'Leica NA2 Precision Level', 'Digital Level', 'Like New', 1150, 'USD',
     'Lusaka Land Systems', 'Lusaka, Zambia',
     'Precision optical level with micrometer, ideal for levelling runs and monitoring.',
     ARRAY['0.7 mm/km accuracy', 'Micrometer plate', 'Aluminium tripod included'], true,
     'sale', 'instrument', -15.3875, 28.3228),

    ('e2000000-0000-4000-8000-000000000009', v_workspace_id,
     'DJI Matrice 350 RTK + Zenmuse P1', 'UAV / Drone', 'Good', 14750, 'USD',
     'Cape Town AeroSurvey', 'Cape Town, South Africa',
     '45-minute flight time, full photogrammetry rig, 3 spare batteries and case.',
     ARRAY['RTK/PPK centimetre accuracy', 'Zenmuse P1 45MP', 'TB65 batteries x3'], true,
     'sale', 'instrument', -33.9249, 18.4241),

    ('e2000000-0000-4000-8000-000000000010', v_workspace_id,
     'WingtraOne Gen II VTOL (Hire)', 'UAV / Drone', 'Like New', 420, 'USD',
     'Nairobi Survey Supply', 'Nairobi, Kenya',
     'Weekly hire of VTOL mapping drone with PPK, includes pilot briefing session.',
     ARRAY['Take-off area 2x2 m', '61MP RX1R II option', 'PPK processing'], true,
     'hire', 'instrument', -1.2864, 36.8172),

    ('e2000000-0000-4000-8000-000000000011', v_workspace_id,
     'Autel EVO Max 4T Mapping Drone', 'UAV / Drone', 'New', 9800, 'USD',
     'Dar Aerial Services', 'Dar es Salaam, Tanzania',
     'Compact mapping and inspection drone with RTK module and dual payload.',
     ARRAY['42-minute flight time', 'RTK module', 'IP43'], true,
     'sale', 'instrument', -6.7924, 39.2083),

    ('e2000000-0000-4000-8000-000000000012', v_workspace_id,
     'Faro Focus Premium Laser Scanner', '3D Scanner', 'Like New', 23500, 'USD',
     'Cape Town AeroSurvey', 'Cape Town, South Africa',
     'Terrestrial scanner with tripod, targets, and SCENE software licence.',
     ARRAY['350 m range', 'Sub-millimetre noise', 'Colour HDR imaging'], true,
     'sale', 'instrument', -33.9249, 18.4241),

    ('e2000000-0000-4000-8000-000000000013', v_workspace_id,
     'Trimble TX8 3D Scanner (Hire)', '3D Scanner', 'Good', 350, 'USD',
     'Dubai Metrology Trading', 'Dubai, United Arab Emirates',
     'Daily hire with registration software and on-site training for first-time users.',
     ARRAY['120 m range', '1 mm accuracy', 'Daily rate'], true,
     'hire', 'instrument', 25.2048, 55.2708),

    ('e2000000-0000-4000-8000-000000000014', v_workspace_id,
     'Single Beam Echo Sounder Kit', 'Echo Sounder', 'Good', 16400, 'USD',
     'Mombasa Hydrographic Supplies', 'Mombasa, Kenya',
     'Bathymetric echosounder with GNSS antenna and acquisition software.',
     ARRAY['0.01 m resolution', 'Bluetooth tide gauge', 'IP66'], true,
     'sale', 'instrument', -4.0435, 39.6682),

    ('e2000000-0000-4000-8000-000000000015', v_workspace_id,
     'Trimble TSC7 Field Controller', 'Controller', 'Like New', 2900, 'USD',
     'Harare Geomatics Ltd', 'Harare, Zimbabwe',
     'Windows field controller with Trimble Access and charger, ready for site work.',
     ARRAY['7-inch touchscreen', 'Trimble Access licence', 'All-day battery'], true,
     'sale', 'instrument', -17.8252, 31.0335),

    ('e2000000-0000-4000-8000-000000000016', v_workspace_id,
     'Leica CS20 Field Controller', 'Controller', 'Good', 1850, 'USD',
     'Accra Instruments', 'Accra, Ghana',
     'Rugged controller with Captivate licence, keyboard, and carry case.',
     ARRAY['5-inch display', 'Captivate licence', 'IP66'], true,
     'sale', 'instrument', 5.6037, -0.1870),

    ('e2000000-0000-4000-8000-000000000017', v_workspace_id,
     'Instrument Calibration & Repair Service', 'Calibration Service', 'Service', 150, 'USD',
     'Nairobi Survey Supply', 'Nairobi, Kenya',
     'Annual calibration, collimation adjustment, and repair for total stations and levels.',
     ARRAY['Traceable certificates', '48-hour turnaround', 'Courier collection'], true,
     'sale', 'instrument', -1.2864, 36.8172),

    ('e2000000-0000-4000-8000-000000000018', v_workspace_id,
     'Leica GPR1 Circular Prism Set', 'Accessory', 'New', 380, 'USD',
     'Harare Geomatics Ltd', 'Harare, Zimbabwe',
     'Precision circular prism with target plate and Leica-compatible offset.',
     ARRAY['Plus/minus 2 mm offset accuracy', 'GPH1 holder included'], true,
     'sale', 'accessory', -17.8252, 31.0335),

    ('e2000000-0000-4000-8000-000000000019', v_workspace_id,
     'Seco 8ft Snap-Lock Rover Rod (Hire)', 'Accessory', 'Like New', 12, 'USD',
     'Thames Ground Control Co', 'London, United Kingdom',
     'Telescopic rover rod with graduation marks in metric and imperial.',
     ARRAY['Snap-lock locking', '10ths/100ths scale', 'Daily rate'], true,
     'hire', 'accessory', 51.5072, -0.1276),

    ('e2000000-0000-4000-8000-000000000020', v_workspace_id,
     'Heavy-Duty Survey Tripod', 'Accessory', 'Good', 210, 'USD',
     'Nairobi Survey Supply', 'Nairobi, Kenya',
     'Fibreglass tripod with quick-release head and shoulder strap.',
     ARRAY['Quick-release head', '5/8-inch thread', 'Carry strap included'], true,
     'sale', 'accessory', -1.2864, 36.8172),

    ('e2000000-0000-4000-8000-000000000021', v_workspace_id,
     'SiteBook Field Tablet Sunshade & Bracket', 'Accessory', 'New', 165, 'USD',
     'Nairobi Survey Supply', 'Nairobi, Kenya',
     'High-visibility sunshade and pole bracket for 8-inch field tablets.',
     ARRAY['Fits TSC7 and Trimble tablets', 'Quick-release bracket'], true,
     'sale', 'accessory', -1.2864, 36.8172),

    ('e2000000-0000-4000-8000-000000000022', v_workspace_id,
     'Tribrach with Optical Plummet', 'Accessory', 'Like New', 290, 'USD',
     'Harare Geomatics Ltd', 'Harare, Zimbabwe',
     'Standard tribrach with optical plummet, checked for centring accuracy.',
     ARRAY['Optical plummet', '5/8-inch mount', 'Carrying case'], true,
     'sale', 'accessory', -17.8252, 31.0335)
  on conflict (id) do nothing;

  insert into public.professionals
    (id, workspace_id, name, title, discipline, experience, location, rate,
     rate_per, currency, availability, rating, reviews, skills, bio,
     certifications, is_global, latitude, longitude)
  values
    ('e3000000-0000-4000-8000-000000000001', v_workspace_id,
     'Tendai Moyo', 'Licensed Cadastral Surveyor', 'Cadastral', '12 years',
     'Harare, Zimbabwe', 65, 'hour', 'USD', 'Available now', 4.9, 34,
     ARRAY['Cadastral re-surveys', 'Farm planning', 'Estate beacons'],
     'Registered land surveyor handling title surveys and boundary disputes across Zimbabwe.',
     ARRAY['BSc Geomatics (NUST)', 'Registered Surveyor Zim'], true, -17.8252, 31.0335),

    ('e3000000-0000-4000-8000-000000000002', v_workspace_id,
     'Grace Wanjiru', 'Engineering Surveyor', 'Construction', '8 years',
     'Nairobi, Kenya', 55, 'hour', 'USD', 'From next week', 4.8, 27,
     ARRAY['Setting out', 'As-built checks', 'Rail corridors'],
     'Specialist in highway and rail setting out, including recent SGR extension sections.',
     ARRAY['BEng Geospatial (JKUAT)', 'ISK Member'], true, -1.2864, 36.8172),

    ('e3000000-0000-4000-8000-000000000003', v_workspace_id,
     'Pieter van der Merwe', 'Mine Surveyor', 'Mining', '15 years',
     'Johannesburg, South Africa', 480, 'day', 'USD', 'Monthly slots', 4.9, 41,
     ARRAY['Shaft surveys', 'Volume computations', 'Tailings'],
     'Mine surveyor for open-pit and underground operations, specialising in solids modelling and reporting.',
     ARRAY['PLATO Certificate', 'SAGC Registered'], true, -26.2041, 28.0473),

    ('e3000000-0000-4000-8000-000000000004', v_workspace_id,
     'Amara Okonkwo', 'Hydrographic Surveyor', 'Hydrography', '9 years',
     'Lagos, Nigeria', 70, 'hour', 'USD', 'Available now', 4.7, 19,
     ARRAY['Bathymetry', 'Dredge volumes', 'Chart QA'],
     'Nearshore and inland waterway surveys along the Gulf of Guinea with multibeam processing.',
     ARRAY['Cat A Hydrography (IHO)', 'MSc Hydrography'], true, 6.5244, 3.3792),

    ('e3000000-0000-4000-8000-000000000005', v_workspace_id,
     'James Whitfield', 'Photogrammetry Lead', 'UAV / Photogrammetry', '11 years',
     'London, United Kingdom', 75, 'hour', 'USD', 'From next week', 4.9, 52,
     ARRAY['RTK/PPK missions', 'Orthophoto production', 'Metashape'],
     'Leads UAV mapping programmes for infrastructure and urban modelling across the UK.',
     ARRAY['CAA GVC', 'RICS CPD certified'], true, 51.5072, -0.1276),

    ('e3000000-0000-4000-8000-000000000006', v_workspace_id,
     'Chiedza Ncube', 'GIS Specialist', 'GIS', '6 years',
     'Bulawayo, Zimbabwe', 45, 'hour', 'USD', 'Available now', 4.6, 14,
     ARRAY['QGIS', 'PostGIS', 'Utility data QA'],
     'Builds geodatabases and web maps for utility, agriculture, and municipal clients.',
     ARRAY['BSc GIS (MSU)', 'Esri Desktop Associate'], true, -20.1530, 28.5799),

    ('e3000000-0000-4000-8000-000000000007', v_workspace_id,
     'Kofi Mensah', 'Geodetic Surveyor', 'Geodesy', '13 years',
     'Accra, Ghana', 60, 'hour', 'USD', 'Monthly slots', 4.8, 23,
     ARRAY['Control networks', 'GNSS processing', 'Least squares adjustment'],
     'Establishes geodetic control networks and processes static GNSS campaigns regionally.',
     ARRAY['MSc Geodesy (KNUST)', 'Ghana Institution of Surveyors'], true, 5.6037, -0.1870),

    ('e3000000-0000-4000-8000-000000000008', v_workspace_id,
     'Sarah Kimani', 'Land Surveyor', 'Cadastral', '7 years',
     'Mombasa, Kenya', 50, 'hour', 'USD', 'Available now', 4.7, 18,
     ARRAY['Boundary surveys', 'Title mapping', 'Plot subdivision'],
     'Coastal land surveyor working on subdivision schemes, beachfront parcels, and title mapping.',
     ARRAY['BSc Surveying (UoN)', 'ISK Member'], true, -4.0435, 39.6682),

    ('e3000000-0000-4000-8000-000000000009', v_workspace_id,
     'Rui Almeida', 'Laser Scanning Specialist', 'Scanning', '10 years',
     'Lisbon, Portugal', 68, 'hour', 'USD', 'From next week', 4.8, 29,
     ARRAY['Terrestrial scanning', 'Point cloud registration', 'Heritage capture'],
     'Reality-capture specialist for heritage buildings, industrial plants, and as-built documentation.',
     ARRAY['Faro Certified Operator', 'MSc Geospatial Engineering'], true, 38.7223, -9.1393),

    ('e3000000-0000-4000-8000-000000000010', v_workspace_id,
     'Anna de Klerk', 'Engineering Surveyor', 'Construction', '9 years',
     'Cape Town, South Africa', 58, 'hour', 'USD', 'Available now', 4.8, 31,
     ARRAY['Setting out', 'Deformation monitoring', 'Scan-to-BIM'],
     'Construction surveyor for high-rise and civil works, with deformation monitoring experience.',
     ARRAY['NDip Surveying (CPUT)', 'SAGC Registered'], true, -33.9249, 18.4241)
  on conflict (id) do nothing;

  insert into public.market_job_posts
    (id, workspace_id, title, discipline, employment_type, rate, rate_per,
     currency, location, description, requirements, latitude, longitude, is_global)
  values
    ('e4000000-0000-4000-8000-000000000001', v_workspace_id,
     'Licensed Cadastral Surveyor', 'Cadastral', 'contract', 320, 'day', 'USD',
     'Harare, Zimbabwe',
     'Subdivision surveys for a peri-urban land development programme. Six-month engagement with extension likely.',
     ARRAY['Registered with SIRDC', 'Total station and GNSS fieldwork', 'SG6 report writing'],
     -17.8252, 31.0335, true),

    ('e4000000-0000-4000-8000-000000000002', v_workspace_id,
     'Drone Mapping Pilot (UAV)', 'Photogrammetry', 'casual', 180, 'day', 'USD',
     'Nairobi, Kenya',
     'Fly RTK/PPK missions for construction progress and topographic deliverables across East Africa.',
     ARRAY['Valid KCAA RPC licence', 'DJI M350 or Wingtra experience', 'Agisoft Metashape'],
     -1.2864, 36.8172, true),

    ('e4000000-0000-4000-8000-000000000003', v_workspace_id,
     'Setting-Out Engineer', 'Engineering Survey', 'contract', 260, 'day', 'GBP',
     'Manchester, United Kingdom',
     'Setting out for a rail enabling-works package. Night shifts with a two-crew rotation.',
     ARRAY['CSCS card', 'Rail sentinel desirable', 'Robotic total station fluency'],
     53.4808, -2.2426, true),

    ('e4000000-0000-4000-8000-000000000004', v_workspace_id,
     'GIS Analyst — Utility As-Built QA', 'GIS', 'permanent', 3800, 'month', 'CAD',
     'Toronto, Canada',
     'QA/QC as-built submissions against municipal data standards, with light field verification.',
     ARRAY['PostGIS and QGIS', 'ESRI Utility Network exposure', 'SQL fundamentals'],
     43.6532, -79.3832, true),

    ('e4000000-0000-4000-8000-000000000005', v_workspace_id,
     'Mine Surveyor', 'Mining', 'permanent', 2500, 'month', 'USD',
     'Kitwe, Zambia',
     'Open-pit mine survey role covering monthly volumes, pit designs, and reconciliation reporting.',
     ARRAY['Mine surveying experience', 'Surpac or Datamine', 'Valid driver licence'],
     -12.8024, 28.2132, true),

    ('e4000000-0000-4000-8000-000000000006', v_workspace_id,
     'Hydrographic Survey Technician', 'Hydrography', 'contract', 210, 'day', 'USD',
     'Lagos, Nigeria',
     'Support nearshore bathymetric campaigns: mobilisation, data acquisition, and processing QA.',
     ARRAY['Multibeam or single beam experience', 'HYPACK or QINSy', 'Offshore medical'],
     6.5244, 3.3792, true),

    ('e4000000-0000-4000-8000-000000000007', v_workspace_id,
     'Land Survey Assistant', 'Cadastral', 'casual', 45, 'day', 'USD',
     'Bulawayo, Zimbabwe',
     'Field assistant for boundary and topographical surveys; training provided for the right candidate.',
     ARRAY['Physically fit', 'Willing to travel', 'Basic maths'],
     -20.1530, 28.5799, true),

    ('e4000000-0000-4000-8000-000000000008', v_workspace_id,
     '3D Laser Scanning Technician', 'Scanning', 'contract', 320, 'day', 'USD',
     'Dubai, United Arab Emirates',
     'Scan industrial plants and buildings, register point clouds, and prepare as-built deliverables.',
     ARRAY['Faro or Leica scanner experience', 'Cyclone or Register 360', 'UAE driving licence'],
     25.2048, 55.2708, true)
  on conflict (id) do nothing;

  insert into public.market_firms
    (id, workspace_id, name, services, location, about, verified, staff_count,
     founded_year, latitude, longitude, is_global)
  values
    ('e5000000-0000-4000-8000-000000000001', v_workspace_id,
     'Harare Geomatics Ltd',
     ARRAY['Cadastral survey', 'Topographic mapping', 'Engineering setting out'],
     'Harare, Zimbabwe',
     'Full-service land surveying consultancy serving mining, agriculture, and urban development since 2009.',
     true, 24, 2009, -17.8252, 31.0335, true),

    ('e5000000-0000-4000-8000-000000000002', v_workspace_id,
     'Cape Town AeroSurvey',
     ARRAY['UAV photogrammetry', 'LiDAR', 'Orthophoto production'],
     'Cape Town, South Africa',
     'Drone-first geospatial studio delivering centimetre-grade aerial products across Southern Africa.',
     true, 11, 2016, -33.9249, 18.4241, true),

    ('e5000000-0000-4000-8000-000000000003', v_workspace_id,
     'Nairobi Survey Supply',
     ARRAY['Instrument sales', 'Equipment hire', 'Calibration service'],
     'Nairobi, Kenya',
     'Authorised dealer and service centre for major survey instrument brands in East Africa.',
     false, 18, 2011, -1.2864, 36.8172, true),

    ('e5000000-0000-4000-8000-000000000004', v_workspace_id,
     'Thames Ground Control Co',
     ARRAY['Utility surveying', 'Measured building survey', 'Monitoring'],
     'London, United Kingdom',
     'Specialist utility mapping and structural monitoring for infrastructure contractors.',
     true, 32, 2004, 51.5072, -0.1276, true),

    ('e5000000-0000-4000-8000-000000000005', v_workspace_id,
     'Gulf Metrology Trading LLC',
     ARRAY['Instrument sales', 'Laser calibration', 'Training'],
     'Dubai, United Arab Emirates',
     'Metrology equipment supplier with an accredited calibration laboratory serving the Gulf region.',
     false, 9, 2014, 25.2048, 55.2708, true),

    ('e5000000-0000-4000-8000-000000000006', v_workspace_id,
     'Lagos Field Equipment',
     ARRAY['Instrument sales', 'Field support', 'Equipment hire'],
     'Lagos, Nigeria',
     'Survey equipment distributor supporting construction and hydrographic crews across West Africa.',
     false, 7, 2018, 6.5244, 3.3792, true)
  on conflict (id) do nothing;

  insert into public.market_events
    (id, workspace_id, title, kind, provider, starts_at, ends_at, location,
     price, currency, description, certification_body, seats_left)
  values
    ('e6000000-0000-4000-8000-000000000001', v_workspace_id,
     'RTK GNSS Field Workflows — 2 Day Course', 'course', 'SiteSurveyor Academy',
     now() + interval '14 days', now() + interval '14 days' + interval '16 hours',
     'Harare, Zimbabwe', 240, 'USD',
     'Hands-on base-rover setup, observation best practice, and post-processing for cadastral-grade work.',
     'SiteSurveyor Academy certificate', 12),

    ('e6000000-0000-4000-8000-000000000002', v_workspace_id,
     'Drone Photogrammetry for Surveyors', 'course', 'Cape Town AeroSurvey',
     now() + interval '30 days', now() + interval '31 days',
     'Cape Town, South Africa', 380, 'USD',
     'Mission planning, ground control, and photogrammetry processing from flight to orthophoto.',
     'SA Geomatics Council CPD: 2 credits', 8),

    ('e6000000-0000-4000-8000-000000000003', v_workspace_id,
     'Applied Hydrography Webinar', 'event', 'SiteSurveyor Academy',
     now() + interval '7 days', now() + interval '7 days' + interval '3 hours',
     'Online', 0, 'USD',
     'Free session covering multibeam basics, sound velocity, and QA workflows for inland waterways.',
     null, 200),

    ('e6000000-0000-4000-8000-000000000004', v_workspace_id,
     'Total Station Care & Calibration Clinic', 'event', 'Nairobi Survey Supply',
     now() + interval '21 days', now() + interval '21 days' + interval '6 hours',
     'Nairobi, Kenya', 40, 'USD',
     'Bring your instrument: collimation checks, prism constants, and servicing intervals explained.',
     'Attendance certificate', 20),

    ('e6000000-0000-4000-8000-000000000005', v_workspace_id,
     'RICS APC Surveying Pathways Masterclass', 'course', 'Thames Ground Control Co',
     now() + interval '45 days', now() + interval '45 days' + interval '8 hours',
     'London, United Kingdom', 150, 'GBP',
     'Structured preparation for RICS assessment: case study, competency sign-off strategy, and mock panel.',
     'RICS CPD: 7 hours', 25),

    ('e6000000-0000-4000-8000-000000000006', v_workspace_id,
     'Mine Surveying Safety Refresher', 'course', 'Johannesburg Mine Survey Services',
     now() + interval '60 days', now() + interval '60 days' + interval '6 hours',
     'Johannesburg, South Africa', 180, 'USD',
     'Underground safety, ventilation awareness, and emergency procedures for mine survey crews.',
     'MQA-aligned attendance certificate', 15)
  on conflict (id) do nothing;
end $$;
