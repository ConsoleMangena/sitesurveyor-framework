-- Fill the columns added by 20261101120000 on the sample market rows, so the
-- public /market page demonstrates the full detail set instead of blank fields.
-- Scoped to the sample workspace seeded by 20261031130000.

do $$
declare
  v_workspace_id uuid;
begin
  select id into v_workspace_id
  from public.workspaces
  where id = 'e0000000-0000-4000-8000-000000000001'
     or slug = 'site-surveyor-sample-market'
  order by created_at
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  -- Listings: expiry, delivery terms, verification, hire windows.
  update public.marketplace_listings
  set expires_at = coalesce(expires_at, now() + interval '120 days'),
      delivery = coalesce(delivery, 'Collection or courier'),
      negotiable = true,
      is_verified = true
  where workspace_id = v_workspace_id;

  update public.marketplace_listings
  set warranty_months = coalesce(warranty_months, 6)
  where workspace_id = v_workspace_id
    and listing_type = 'sale';

  update public.marketplace_listings
  set available_from = coalesce(available_from, current_date + 3),
      available_to = coalesce(available_to, current_date + 45),
      serial_number = coalesce(serial_number, 'HIRE-' || left(id::text, 8))
  where workspace_id = v_workspace_id
    and listing_type = 'hire';

  update public.marketplace_listings
  set serial_number = coalesce(serial_number, 'TS16-2023-0451'),
      manufacture_year = coalesce(manufacture_year, 2023)
  where id = 'e2000000-0000-4000-8000-000000000001';

  -- Jobs: hiring firm, closing date, seniority, benefits.
  update public.market_job_posts
  set company = coalesce(
        company,
        case
          when location like 'Harare%' then 'Harare Geomatics Ltd'
          when location like 'Nairobi%' then 'Nairobi Survey Supply'
          when location like 'Bulawayo%' then 'Bulawayo Survey Works'
          when location like 'London%' then 'Thames Ground Control Co'
          else 'SiteSurveyor Sample Market'
        end
      ),
      closes_at = coalesce(closes_at, now() + interval '30 days'),
      seniority = coalesce(
        seniority,
        case
          when title ilike '%graduate%' then 'Entry level'
          when title ilike '%licensed%' or title ilike '%hydrographic%' then 'Senior'
          else 'Mid-level'
        end
      ),
      benefits = case
        when cardinality(benefits) = 0
          then array['Transport allowance', 'Field equipment provided']
        else benefits
      end
  where workspace_id = v_workspace_id;

  -- Training & events: venue, timezone, faculty, CPD, registration window.
  update public.market_events
  set venue_address = coalesce(venue_address, nullif(location, 'Online')),
      timezone = case when lower(location) = 'online' then 'UTC' else 'Africa/Harare' end,
      capacity = coalesce(capacity, coalesce(seats_left, 20) + 10),
      registration_deadline = coalesce(registration_deadline, starts_at - interval '2 days'),
      cpd_points = coalesce(cpd_points, 2),
      instructor = coalesce(instructor, 'SiteSurveyor Academy faculty'),
      is_remote = lower(location) = 'online'
  where workspace_id = v_workspace_id;

  -- Firms: service areas from the published location, accreditation for
  -- verified practices.
  update public.market_firms
  set updated_at = now(),
      service_areas = case
        when cardinality(service_areas) = 0
          then array[coalesce(nullif(trim(split_part(location, ',', 2)), ''), location)]
        else service_areas
      end,
      accreditations = case
        when verified and cardinality(accreditations) = 0
          then array['Chartered surveying practice']
        else accreditations
      end
  where workspace_id = v_workspace_id;

  -- Professionals: languages, travel radius, credential issuer.
  update public.professionals
  set languages = case
        when cardinality(languages) = 0 then array['English']
        else languages
      end,
      travel_radius_km = coalesce(travel_radius_km, 150),
      credential_issuer = coalesce(credential_issuer, 'National geomatics council'),
      updated_at = now()
  where workspace_id = v_workspace_id;
end
$$;
