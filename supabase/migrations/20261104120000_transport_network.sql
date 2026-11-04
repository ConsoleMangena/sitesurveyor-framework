-- SiteSurveyor logistics: the transport network.
--
-- A verified platform fleet runs published corridors between surveying cities.
-- A run is pooled: it rolls when it reaches the load target for its vehicle
-- size class, or when its backstop date forces the decision, whichever comes
-- first. Position is only ever what a human reported at a stop, so nothing in
-- this schema can imply GPS telemetry the product does not have.
--
-- Base tables are platform-admin readable and writable. Visitors read the
-- narrow public_transport_* views instead, following the existing public_market_*
-- pattern. Every state change a customer or an admin can cause goes through a
-- function, so the rules below are enforced once, in the database, rather than
-- in whichever tab happened to click first.

-- ── 1. Cities and hubs ───────────────────────────────────────────────────────

create table if not exists public.transport_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Zimbabwe',
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  timezone text not null default 'Africa/Harare',
  hub_address text,
  hub_hours text,
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, country)
);

-- ── 2. Vehicle size classes ─────────────────────────────────────────────────
-- The size class carries the load target, which is what makes pooling cheaper:
-- a big truck does not need to be full to be worth rolling, a motorbike is
-- worth sending almost full. Capacities are snapshotted onto each departure so
-- editing a class never rewrites history under a run that is already moving.

create table if not exists public.transport_vehicle_classes (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  capacity_slots integer not null check (capacity_slots > 0),
  capacity_kg numeric(12, 2) not null check (capacity_kg > 0),
  min_load_ratio numeric(4, 3) not null default 0.600
    check (min_load_ratio >= 0.05 and min_load_ratio <= 1.000),
  default_backstop_days integer not null default 4
    check (default_backstop_days between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.transport_vehicle_classes (id)
    on delete restrict,
  plate text not null unique,
  description text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'suspended')),
  -- "verified" is a record, not a badge: it cannot exist without the admin who
  -- signed it off and the document they signed it against.
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  insurance_reference text,
  workspace_id uuid references public.workspaces (id) on delete set null,
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    verification_status <> 'verified'
    or (verified_at is not null and verified_by is not null
        and insurance_reference is not null)
  )
);

-- ── 3. Corridors and their stops ─────────────────────────────────────────────

create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  origin_city_id uuid not null references public.transport_cities (id) on delete restrict,
  destination_city_id uuid not null references public.transport_cities (id) on delete restrict,
  direct_distance_km numeric(8, 2),
  fare_per_slot numeric(12, 2) not null default 0 check (fare_per_slot >= 0),
  fare_per_kg numeric(12, 2) not null default 0 check (fare_per_kg >= 0),
  fare_final_mile numeric(12, 2) not null default 0 check (fare_final_mile >= 0),
  currency text not null default 'USD',
  status text not null default 'published'
    check (status in ('draft', 'published', 'paused', 'retired')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin_city_id <> destination_city_id)
);

create table if not exists public.transport_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.transport_routes (id) on delete cascade,
  city_id uuid not null references public.transport_cities (id) on delete restrict,
  sequence integer not null check (sequence >= 1),
  stop_offset_km numeric(8, 2),
  dwell_minutes integer not null default 45 check (dwell_minutes >= 0),
  created_at timestamptz not null default now(),
  unique (route_id, sequence)
);

-- ── 4. Bookings ─────────────────────────────────────────────────────────────
-- Pooled freight is sold weight or measure, never one of the two: a total
-- station is 2 slots and 40 kg, eight tonnes of crusher dust is neither in
-- slots at all. A booking carries both, and the load meter always names which
-- dimension governs the run.

create table if not exists public.transport_bookings (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The run itself is not referenced yet at this point in the file: bookings
  -- and departures point at each other, so this half of the cycle is added
  -- after both tables exist.
  departure_id uuid not null,
  listing_id uuid references public.marketplace_listings (id) on delete set null,
  order_id uuid references public.marketplace_orders (id) on delete set null,
  mode text not null default 'parcel'
    check (mode in ('parcel', 'bulk_share', 'charter')),
  slots integer not null default 1 check (slots >= 0),
  weight_kg numeric(12, 2) not null default 0 check (weight_kg >= 0),
  contents text not null,
  pickup_city_id uuid not null references public.transport_cities (id) on delete restrict,
  dropoff_city_id uuid not null references public.transport_cities (id) on delete restrict,
  recipient_name text not null,
  recipient_phone text,
  fulfilment text not null default 'hub_collection'
    check (fulfilment in ('hub_collection', 'final_mile')),
  fee numeric(12, 2) not null default 0 check (fee >= 0),
  currency text not null default 'USD',
  fee_status text not null default 'pending_payment'
    check (fee_status in ('pending_payment', 'paid', 'refunded', 'waived', 'failed')),
  payment_provider text
    check (payment_provider is null or payment_provider in ('solana', 'pesepay')),
  payment_reference text,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_load_check', 'confirmed',
                      'picked_up', 'in_transit', 'at_hub', 'out_for_delivery',
                      'delivered', 'exception', 'failed', 'cancelled', 'expired')),
  cancel_reason text,
  -- Capacity is handed back exactly once. Without a marker here, a sweep that
  -- releases an unpaid hold and a cancellation that releases the same hold would
  -- both subtract, and the run would quietly sell space it never lost.
  capacity_released_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  proof_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup_city_id <> dropoff_city_id),
  check (slots > 0 or weight_kg > 0)
);

create index if not exists transport_bookings_workspace_idx
  on public.transport_bookings (workspace_id, created_at desc);
create index if not exists transport_bookings_departure_idx
  on public.transport_bookings (departure_id, status);

-- ── 5. Departures ────────────────────────────────────────────────────────────

create table if not exists public.transport_departures (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.transport_routes (id) on delete cascade,
  vehicle_id uuid references public.transport_vehicles (id) on delete set null,
  vehicle_class_id uuid references public.transport_vehicle_classes (id) on delete set null,
  planned_departure_at timestamptz not null,
  booking_cutoff_at timestamptz not null,
  backstop_at timestamptz not null,
  target_load_ratio numeric(4, 3) not null default 0.600
    check (target_load_ratio >= 0.05 and target_load_ratio <= 1.000),
  capacity_slots integer not null check (capacity_slots > 0),
  capacity_kg numeric(12, 2) not null check (capacity_kg > 0),
  booked_slots integer not null default 0 check (booked_slots >= 0),
  booked_kg numeric(12, 2) not null default 0 check (booked_kg >= 0),
  status text not null default 'open'
    check (status in ('draft', 'open', 'quorum_met', 'overdue', 'rolling',
                      'in_transit', 'at_destination', 'closed', 'cancelled', 'expired')),
  departed_at timestamptz,
  arrived_at timestamptz,
  cancel_reason text,
  private_booking_id uuid references public.transport_bookings (id) on delete set null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (booked_slots <= capacity_slots),
  check (booked_kg <= capacity_kg),
  check (booking_cutoff_at <= planned_departure_at),
  check (booking_cutoff_at < backstop_at)
);

create index if not exists transport_departures_open_idx
  on public.transport_departures (status, booking_cutoff_at);
create index if not exists transport_departures_route_idx
  on public.transport_departures (route_id, planned_departure_at desc);

-- The booking⇄departure pair refers to each other: a booking needs its run, and
-- a chartered run names the booking that bought all of it. Whichever half of
-- the cycle is created second can now be linked.
alter table public.transport_bookings
  drop constraint if exists transport_bookings_departure_fkey;
alter table public.transport_bookings
  add constraint transport_bookings_departure_fkey
  foreign key (departure_id) references public.transport_departures (id)
  on delete restrict;

alter table public.transport_departures
  drop constraint if exists transport_departures_route_cutoff;
alter table public.transport_departures
  add constraint transport_departures_route_cutoff
  check (planned_departure_at <= backstop_at);

-- ── 6. Checkpoints: the only source of "live" ────────────────────────────────
-- Coordinates are copied from the city at report time so a later hub edit
-- cannot retro-move a run that already passed through.

create table if not exists public.transport_checkpoints (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.transport_departures (id) on delete cascade,
  city_id uuid not null references public.transport_cities (id) on delete restrict,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  sequence integer not null check (sequence >= 1),
  reported_at timestamptz not null default now(),
  reported_by uuid not null references auth.users (id) on delete restrict,
  note text,
  unique (departure_id, sequence)
);

create table if not exists public.transport_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.transport_bookings (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_kind text not null check (actor_kind in ('customer', 'platform', 'system')),
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  at timestamptz not null default now()
);

create index if not exists transport_booking_events_booking_idx
  on public.transport_booking_events (booking_id, at);

-- ── 7. Helpers ───────────────────────────────────────────────────────────────

/** Direct distance between two points. Labelled "direct" wherever it is shown:
 *  it is not a road distance and must not read like one. */
create or replace function public.transport_direct_distance_km(
  p_lat_a numeric, p_lng_a numeric, p_lat_b numeric, p_lng_b numeric
) returns numeric
language sql immutable as $$
  select round(
    (2 * 6371 * asin(
      least(1.0::double precision, sqrt(
        power(sin(radians((p_lat_b - p_lat_a) / 2)), 2)
        + cos(radians(p_lat_a)) * cos(radians(p_lat_b))
          * power(sin(radians((p_lng_b - p_lng_a) / 2)), 2)
      ))
    ))::numeric, 2
  );
$$;

/** Load is the governing fraction of the two dimensions, not their average:
 *  a run is as full as its tightest constraint. */
create or replace function public.transport_load_ratio(p_departure public.transport_departures)
returns numeric
language sql immutable as $$
  select greatest(
    p_departure.booked_slots::numeric / p_departure.capacity_slots::numeric,
    p_departure.booked_kg::numeric / p_departure.capacity_kg::numeric
  );
$$;

create or replace function public.transport_governing_dimension(p_departure public.transport_departures)
returns text
language sql immutable as $$
  select case
    when p_departure.booked_slots::numeric / p_departure.capacity_slots::numeric
       >= p_departure.booked_kg::numeric / p_departure.capacity_kg::numeric
      then 'slots'
    else 'weight'
  end;
$$;

create or replace function public.transport_new_tracking_code()
returns text
language plpgsql as $$
declare
  candidate text;
begin
  loop
    candidate := 'SS-' || upper(encode(gen_random_bytes(4), 'hex'));
    exit when not exists (
      select 1 from public.transport_bookings where tracking_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

/** A stop's position in a corridor, or null when the city is not on it. */
create or replace function public.transport_stop_sequence(p_route_id uuid, p_city_id uuid)
returns integer
language sql stable as $$
  select min(sequence)
  from public.transport_route_stops
  where route_id = p_route_id and city_id = p_city_id;
$$;

-- ── 8. Quorum ────────────────────────────────────────────────────────────────
-- Only ever advances a run forward, so it is safe for a booking write and for
-- the admin sweep to call it alike.

create or replace function public.transport_apply_quorum(p_departure_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.transport_departures;
  v_ratio numeric;
begin
  select * into v from public.transport_departures where id = p_departure_id;
  if not found or v.status not in ('open', 'quorum_met') then
    return;
  end if;

  v_ratio := public.transport_load_ratio(v);

  if v.status = 'open' and v_ratio >= v.target_load_ratio then
    update public.transport_departures set status = 'quorum_met', updated_at = now()
     where id = p_departure_id;
  elsif now() >= v.backstop_at then
    update public.transport_departures
       set status = case when v.booked_slots = 0 and v.booked_kg = 0
                         then 'expired' else 'overdue' end,
           updated_at = now()
     where id = p_departure_id;
  end if;
end;
$$;

-- ── 9. Capacity accounting ──────────────────────────────────────────────────

create or replace function public.transport_release_capacity(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.transport_departures d
     set booked_slots = greatest(0, d.booked_slots - b.slots),
         booked_kg = greatest(0, d.booked_kg - b.weight_kg)
    from public.transport_bookings b
   where b.id = p_booking_id
     and b.departure_id = d.id
     and b.capacity_released_at is null;

  update public.transport_bookings
     set capacity_released_at = now()
   where id = p_booking_id
     and capacity_released_at is null
     and exists (
       select 1 from public.transport_departures d
       where d.id = transport_bookings.departure_id
     );
end;
$$;

/** Admin sweep: release holds that were never paid for, then re-solve every run
 *  still waiting on its target or its backstop date. Returns how many holds
 *  expired. Idempotent — a booking releases its capacity at most once. */
create or replace function public.transport_evaluate_departures()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_expired integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can evaluate departures';
  end if;

  -- The selection is materialised so the release and the marking below both act
  -- on exactly the same set of rows.
  with stale as materialized (
    select b.id, b.departure_id, b.slots, b.weight_kg
      from public.transport_bookings b
      join public.transport_departures d on d.id = b.departure_id
     where b.status = 'pending_payment'
       and b.capacity_released_at is null
       and now() > d.booking_cutoff_at
  ),
  freed as (
    update public.transport_departures d
       set booked_slots = greatest(0, d.booked_slots - s.total_slots),
           booked_kg = greatest(0, d.booked_kg - s.total_weight)
      from (
        select departure_id,
               sum(slots)::integer as total_slots,
               sum(weight_kg)::numeric as total_weight
          from stale
         group by departure_id
      ) s
     where s.departure_id = d.id
  )
  update public.transport_bookings b
     set status = 'expired',
         capacity_released_at = now(),
         updated_at = now()
    from stale s
   where b.id = s.id;
  get diagnostics v_expired = row_count;

  update public.transport_departures d
     set status = case
           when d.status = 'open'
                and public.transport_load_ratio(d) >= d.target_load_ratio
             then 'quorum_met'
           when now() >= d.backstop_at and d.booked_slots = 0 and d.booked_kg = 0
             then 'expired'
           when d.status = 'open' and now() >= d.backstop_at
             then 'overdue'
           else d.status
         end,
         updated_at = now()
   where d.status in ('open', 'quorum_met');

  return v_expired;
end;
$$;

-- ── 10. Booking creation ────────────────────────────────────────────────────
-- The fee rule: transport reserves its capacity the moment a booking exists,
-- so a pooled run cannot be outbid mid-checkout, and the run cannot roll while
-- anything it carries is unpaid. A booking against the specimen network is
-- refused outright — nobody can be charged for a truck that does not exist.

create or replace function public.transport_create_booking(
  p_workspace_id uuid,
  p_departure_id uuid,
  p_mode text,
  p_slots integer,
  p_weight_kg numeric,
  p_contents text,
  p_pickup_city_id uuid,
  p_dropoff_city_id uuid,
  p_recipient_name text,
  p_fulfilment text default 'hub_collection',
  p_recipient_phone text default null,
  p_listing_id uuid default null,
  p_order_id uuid default null
) returns public.transport_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_departure public.transport_departures;
  v_route public.transport_routes;
  v_slots integer := coalesce(p_slots, 0);
  v_weight numeric := coalesce(p_weight_kg, 0);
  v_fee numeric(12, 2);
  v_pickup_seq integer;
  v_dropoff_seq integer;
  v_booking public.transport_bookings;
begin
  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'You are not a member of that workspace';
  end if;
  if p_mode not in ('parcel', 'bulk_share', 'charter') then
    raise exception 'Unknown booking mode';
  end if;
  if p_fulfilment not in ('hub_collection', 'final_mile') then
    raise exception 'Unknown fulfilment option';
  end if;
  if btrim(coalesce(p_contents, '')) = '' or btrim(coalesce(p_recipient_name, '')) = '' then
    raise exception 'Contents and recipient name are required';
  end if;

  select * into v_departure from public.transport_departures where id = p_departure_id
    for update;
  if not found then
    raise exception 'That run does not exist';
  end if;
  if v_departure.is_sample then
    raise exception 'That run is part of the specimen network and is not open for booking';
  end if;

  perform public.transport_apply_quorum(v_departure.id);
  select * into v_departure from public.transport_departures where id = p_departure_id;

  if v_departure.status not in ('open', 'quorum_met') then
    raise exception 'That run is not accepting bookings (it is %)', v_departure.status;
  end if;
  if now() > v_departure.booking_cutoff_at then
    raise exception 'Bookings on that run closed at %', v_departure.booking_cutoff_at;
  end if;

  select * into v_route from public.transport_routes where id = v_departure.route_id;
  if v_route.status <> 'published' then
    raise exception 'That corridor is not open for transport';
  end if;

  v_pickup_seq := public.transport_stop_sequence(v_route.id, p_pickup_city_id);
  v_dropoff_seq := public.transport_stop_sequence(v_route.id, p_dropoff_city_id);
  if v_pickup_seq is null or v_dropoff_seq is null then
    raise exception 'That run does not pass through both of those cities';
  end if;
  if v_pickup_seq >= v_dropoff_seq then
    raise exception 'The drop-off city has to come after the pick-up city on this corridor';
  end if;

  if p_mode = 'charter' then
    -- Buying the vehicle buys every unit on it. Both dimensions are priced out
    -- and the larger wins, which is the same grammar the pooled rate below uses
    -- and the only way a tipper — six load beds, fifteen tonnes — comes out at
    -- its real value instead of six slots' worth.
    v_slots := v_departure.capacity_slots;
    v_weight := v_departure.capacity_kg;
    v_fee := round(
      greatest(
        v_route.fare_per_slot * v_departure.capacity_slots,
        v_route.fare_per_kg * v_departure.capacity_kg
      ), 2
    );
  else
    if v_slots <= 0 and v_weight <= 0 then
      raise exception 'Say how much space you need';
    end if;
    v_fee := round(
      greatest(v_slots * v_route.fare_per_slot, v_weight * v_route.fare_per_kg)
        + case when p_fulfilment = 'final_mile' then v_route.fare_final_mile else 0 end,
      2
    );
  end if;

  if v_slots > v_departure.capacity_slots - v_departure.booked_slots then
    raise exception 'Only % of % slots left on this run',
      greatest(0, v_departure.capacity_slots - v_departure.booked_slots),
      v_departure.capacity_slots;
  end if;
  if v_weight > v_departure.capacity_kg - v_departure.booked_kg then
    raise exception 'Only % kg left on this run',
      greatest(0, round(v_departure.capacity_kg - v_departure.booked_kg, 2));
  end if;

  insert into public.transport_bookings (
    tracking_code, workspace_id, departure_id, listing_id, order_id, mode,
    slots, weight_kg, contents, pickup_city_id, dropoff_city_id,
    recipient_name, recipient_phone, fulfilment, fee, currency,
    fee_status, status
  ) values (
    public.transport_new_tracking_code(), p_workspace_id, p_departure_id,
    p_listing_id, p_order_id, p_mode, v_slots, v_weight,
    btrim(p_contents), p_pickup_city_id, p_dropoff_city_id,
    btrim(p_recipient_name), p_recipient_phone, p_fulfilment, v_fee,
    v_route.currency, 'pending_payment', 'pending_payment'
  ) returning * into v_booking;

  update public.transport_departures
     set booked_slots = booked_slots + v_booking.slots,
         booked_kg = booked_kg + v_booking.weight_kg,
         updated_at = now()
   where id = v_departure.id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (v_booking.id, null, v_booking.status, 'customer', auth.uid(),
     'Held ' || v_booking.slots || ' slot(s) and ' || v_booking.weight_kg
       || ' kg on run ' || v_route.code);

  perform public.transport_apply_quorum(v_departure.id);

  return v_booking;
end;
$$;

-- ── 11. Fee settlement ──────────────────────────────────────────────────────
-- A human who has actually seen the money records it. Bulk loads then wait on a
-- physical fit check, because somebody has to decide whether eight tonnes of
-- gravel sits on a bakkie.

create or replace function public.transport_confirm_fee(
  p_booking_id uuid, p_provider text, p_reference text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_new_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can confirm a fee';
  end if;
  if p_provider not in ('solana', 'pesepay') then
    raise exception 'Unknown payment provider';
  end if;

  select status into v_status from public.transport_bookings where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Booking not found';
  end if;
  if v_status <> 'pending_payment' then
    raise exception 'That booking is already %', v_status;
  end if;

  v_new_status := case
    when (select mode from public.transport_bookings where id = p_booking_id) = 'parcel'
      then 'confirmed'
    else 'pending_load_check'
  end;

  update public.transport_bookings
     set fee_status = 'paid',
         payment_provider = p_provider,
         payment_reference = p_reference,
         status = v_new_status,
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_status, v_new_status, 'platform', auth.uid(),
     'Fee confirmed via ' || p_provider
       || case when p_reference is null then '' else ' · ' || p_reference end);
end;
$$;

create or replace function public.transport_approve_load(p_booking_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can approve a load';
  end if;

  select status into v_status from public.transport_bookings where id = p_booking_id for update;
  if v_status is null then
    raise exception 'Booking not found';
  end if;
  if v_status <> 'pending_load_check' then
    raise exception 'That booking is not waiting on a load check';
  end if;

  update public.transport_bookings
     set status = 'confirmed', updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_status, 'confirmed', 'platform', auth.uid(),
     coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Load checked and accepted'));
end;
$$;

-- ── 12. Cancellation ─────────────────────────────────────────────────────────

create or replace function public.transport_cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.transport_bookings;
  v_cutoff timestamptz;
  v_is_admin boolean;
begin
  select b.* into v_booking from public.transport_bookings b where b.id = p_booking_id
    for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  select booking_cutoff_at into v_cutoff
    from public.transport_departures where id = v_booking.departure_id;

  v_is_admin := public.is_platform_admin();
  if not v_is_admin and not public.is_workspace_member(v_booking.workspace_id) then
    raise exception 'You cannot cancel that booking';
  end if;
  if v_booking.status not in ('pending_payment', 'pending_load_check', 'confirmed') then
    raise exception 'A % booking cannot be cancelled', v_booking.status;
  end if;
  -- A customer may back out until the run closes for booking; after that the
  -- capacity is committed to whoever else is on board.
  if not v_is_admin and now() >= v_cutoff then
    raise exception 'Bookings cannot be cancelled once that run has closed for booking';
  end if;

  perform public.transport_release_capacity(p_booking_id);

  update public.transport_bookings
     set status = 'cancelled',
         cancel_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), cancel_reason),
         fee_status = case when fee_status = 'paid' then 'refunded' else fee_status end,
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_booking.status, 'cancelled',
     case when v_is_admin then 'platform' else 'customer' end, auth.uid(),
     coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Cancelled')
       || case when v_booking.fee_status = 'paid'
               then ' · fee refund due' else '' end);
end;
$$;

create or replace function public.transport_cancel_departure(p_departure_id uuid, p_reason text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can cancel a run';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A cancelled run needs a stated reason';
  end if;

  update public.transport_bookings
     set status = 'cancelled',
         cancel_reason = p_reason,
         fee_status = case when fee_status = 'paid' then 'refunded' else fee_status end,
         updated_at = now()
   where departure_id = p_departure_id
     and status in ('pending_payment', 'pending_load_check', 'confirmed');
  get diagnostics v_count = row_count;

  update public.transport_departures
     set status = 'cancelled',
         cancel_reason = p_reason,
         booked_slots = 0,
         booked_kg = 0,
         updated_at = now()
   where id = p_departure_id;

  return v_count;
end;
$$;

-- ── 13. Booking movement ────────────────────────────────────────────────────

create or replace function public.transport_advance_booking(
  p_booking_id uuid, p_to_status text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.transport_bookings;
  v_allowed boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can move a booking';
  end if;
  if p_to_status not in ('picked_up', 'in_transit', 'at_hub', 'out_for_delivery',
                         'delivered', 'exception', 'failed') then
    raise exception 'That is not a state a booking can be moved to';
  end if;

  select * into v_booking from public.transport_bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  v_allowed := case
    when v_booking.status = 'confirmed'
      then p_to_status in ('picked_up', 'exception', 'failed')
    when v_booking.status = 'pending_load_check'
      then p_to_status in ('exception', 'failed')
    when v_booking.status = 'picked_up'
      then p_to_status in ('in_transit', 'at_hub', 'exception')
    when v_booking.status = 'in_transit'
      then p_to_status in ('at_hub', 'exception')
    when v_booking.status = 'at_hub'
      then p_to_status in ('out_for_delivery', 'delivered', 'exception')
    when v_booking.status = 'out_for_delivery'
      then p_to_status in ('delivered', 'exception', 'failed')
    when v_booking.status = 'exception'
      then p_to_status in ('in_transit', 'at_hub', 'delivered', 'failed')
    else false
  end;
  if not v_allowed then
    raise exception 'A % booking cannot move to %', v_booking.status, p_to_status;
  end if;

  update public.transport_bookings
     set status = p_to_status,
         collected_at = coalesce(collected_at,
           case when p_to_status = 'picked_up' then now() end),
         delivered_at = coalesce(delivered_at,
           case when p_to_status = 'delivered' then now() end),
         updated_at = now()
   where id = p_booking_id;

  insert into public.transport_booking_events
    (booking_id, from_status, to_status, actor_kind, actor_id, note)
  values
    (p_booking_id, v_booking.status, p_to_status, 'platform', auth.uid(), p_note);
end;
$$;

-- ── 14. Departure movement and reported checkpoints ──────────────────────────

create or replace function public.transport_advance_departure(
  p_departure_id uuid, p_to_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.transport_departures;
  v_pending integer;
  v_unverified integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can move a run';
  end if;

  select * into v from public.transport_departures where id = p_departure_id for update;
  if not found then
    raise exception 'That run does not exist';
  end if;

  -- Parenthesised rather than a CASE: plpgsql ends an IF condition at the first
  -- THEN it sees, and a CASE's own THENs land inside that expression.
  if not (
        v.status in ('open', 'quorum_met', 'overdue')
        and p_to_status in ('quorum_met', 'rolling', 'cancelled')
     or v.status = 'rolling'        and p_to_status = 'in_transit'
     or v.status = 'in_transit'     and p_to_status in ('at_destination', 'closed')
     or v.status = 'at_destination' and p_to_status = 'closed'
  ) then
    raise exception 'A % run cannot move to %', v.status, p_to_status;
  end if;

  -- The whole reason the fee comes first: nothing rides unless it has been paid
  -- for, and bulk unless a person has checked it fits.
  if p_to_status = 'rolling' then
    select count(*) into v_pending from public.transport_bookings
     where departure_id = p_departure_id
       and status in ('pending_payment', 'pending_load_check');
    if v_pending > 0 then
      raise exception '% booking(s) still need a confirmed fee or a load check before this run can roll',
        v_pending;
    end if;

    select count(*) into v_unverified
      from public.transport_vehicles ve
     where ve.id = v.vehicle_id and ve.verification_status <> 'verified';
    if v.vehicle_id is not null and v_unverified > 0 then
      raise exception 'That run is assigned to a vehicle that is not verified';
    end if;
  end if;

  update public.transport_departures
     set status = p_to_status,
         departed_at = case when p_to_status = 'in_transit' and departed_at is null
                            then now() else departed_at end,
         arrived_at = case when p_to_status = 'at_destination' then now() else arrived_at end,
         updated_at = now()
   where id = p_departure_id;
end;
$$;

create or replace function public.transport_record_checkpoint(
  p_departure_id uuid, p_city_id uuid, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_city public.transport_cities;
  v_next integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can report a checkpoint';
  end if;

  select * into v_city from public.transport_cities where id = p_city_id;
  if not found then
    raise exception 'That city is not on the network';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_next
    from public.transport_checkpoints where departure_id = p_departure_id;

  insert into public.transport_checkpoints
    (departure_id, city_id, latitude, longitude, sequence, reported_by, note)
  values
    (p_departure_id, p_city_id, v_city.latitude, v_city.longitude, v_next,
     auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

-- ── 15. Offers: the cheapest way to receive the thing ────────────────────────
-- Runs as the owner because the underlying departure table is admin-readable
-- only; visitors must be able to price a delivery before they request it.

create or replace function public.transport_offers_for_city(p_destination_city_id uuid)
returns table (
  departure_id uuid,
  route_id uuid,
  route_code text,
  route_name text,
  origin_city_id uuid,
  origin_city text,
  destination_city text,
  fare_per_slot numeric,
  fare_per_kg numeric,
  currency text,
  free_slots integer,
  free_kg numeric,
  load_percent numeric,
  target_percent numeric,
  status text,
  planned_departure_at timestamptz,
  booking_cutoff_at timestamptz,
  is_sample boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    d.id,
    r.id,
    r.code,
    r.name,
    c_origin.id,
    c_origin.name,
    c_destination.name,
    r.fare_per_slot,
    r.fare_per_kg,
    r.currency,
    (d.capacity_slots - d.booked_slots),
    round(d.capacity_kg - d.booked_kg, 2),
    round(public.transport_load_ratio(d) * 100, 1),
    round(d.target_load_ratio * 100, 1),
    d.status,
    d.planned_departure_at,
    d.booking_cutoff_at,
    d.is_sample
  from public.transport_departures d
  join public.transport_routes r on r.id = d.route_id
  join public.transport_cities c_origin on c_origin.id = r.origin_city_id
  join public.transport_cities c_destination on c_destination.id = p_destination_city_id
  join public.transport_route_stops s_dest
    on s_dest.route_id = r.id and s_dest.city_id = p_destination_city_id
  where r.status = 'published'
    and d.status in ('open', 'quorum_met')
    and now() < d.booking_cutoff_at
    and exists (
      select 1 from public.transport_route_stops s_origin
       where s_origin.route_id = r.id
         and s_origin.city_id = r.origin_city_id
         and s_origin.sequence < s_dest.sequence
    )
  order by d.planned_departure_at;
end;
$$;

-- ── 16. Public geometry ──────────────────────────────────────────────────────

create or replace view public.public_transport_corridors as
select
  r.id as route_id,
  r.code,
  r.name,
  r.currency,
  r.fare_per_slot,
  r.fare_per_kg,
  r.fare_final_mile,
  r.direct_distance_km,
  r.is_sample,
  r.status as route_status,
  o.id as origin_city_id,
  o.name as origin_city,
  o.country as origin_country,
  o.latitude as origin_latitude,
  o.longitude as origin_longitude,
  d.id as destination_city_id,
  d.name as destination_city,
  d.country as destination_country,
  d.latitude as destination_latitude,
  d.longitude as destination_longitude,
  (
    select count(*)
    from public.transport_departures x
    where x.route_id = r.id
      and x.status in ('open', 'quorum_met')
      and x.booking_cutoff_at > now()
  ) as open_runs,
  (
    select min(x.planned_departure_at)
    from public.transport_departures x
    where x.route_id = r.id
      and x.status in ('open', 'quorum_met')
      and x.booking_cutoff_at > now()
  ) as next_roll_at,
  (
    select count(*)
    from public.transport_departures x
    where x.route_id = r.id and x.status in ('rolling', 'in_transit', 'at_destination')
  ) as live_runs
from public.transport_routes r
join public.transport_cities o on o.id = r.origin_city_id
join public.transport_cities d on d.id = r.destination_city_id
where r.status in ('published', 'paused');

create or replace view public.public_transport_stops as
select
  s.route_id,
  s.sequence,
  s.dwell_minutes,
  s.stop_offset_km,
  c.id as city_id,
  c.name as city,
  c.country,
  c.latitude,
  c.longitude,
  (c.hub_address is not null) as has_hub
from public.transport_route_stops s
join public.transport_cities c on c.id = s.city_id;

create or replace view public.public_transport_runs as
select
  dep.id as departure_id,
  dep.route_id,
  r.code as route_code,
  r.name as route_name,
  r.currency,
  r.fare_per_slot,
  r.fare_per_kg,
  r.fare_final_mile,
  dep.planned_departure_at,
  dep.booking_cutoff_at,
  dep.backstop_at,
  dep.status,
  dep.capacity_slots,
  dep.capacity_kg,
  dep.booked_slots,
  dep.booked_kg,
  dep.is_sample,
  -- The charter's booking id stays on the base table: the public only needs to
  -- know a run has been bought whole, not which customer bought it.
  (dep.private_booking_id is not null) as is_private_charter,
  dep.departed_at,
  dep.arrived_at,
  round(public.transport_load_ratio(dep) * 100, 1) as load_percent,
  round(dep.target_load_ratio * 100, 1) as target_percent,
  public.transport_governing_dimension(dep) as governing_dimension,
  vc.label as vehicle_class,
  v.verification_status as vehicle_verification,
  o.name as origin_city,
  d.name as destination_city,
  (
    select c2.name
    from public.transport_checkpoints cp2
    join public.transport_cities c2 on c2.id = cp2.city_id
    where cp2.departure_id = dep.id
    order by cp2.sequence desc limit 1
  ) as last_reported_city,
  (
    select max(cp3.reported_at)
    from public.transport_checkpoints cp3 where cp3.departure_id = dep.id
  ) as last_reported_at
from public.transport_departures dep
join public.transport_routes r on r.id = dep.route_id
left join public.transport_vehicles v on v.id = dep.vehicle_id
left join public.transport_vehicle_classes vc on vc.id = dep.vehicle_class_id
join public.transport_cities o on o.id = r.origin_city_id
join public.transport_cities d on d.id = r.destination_city_id;

create or replace view public.public_transport_checkpoints as
select
  cp.departure_id,
  cp.sequence,
  cp.latitude,
  cp.longitude,
  cp.reported_at,
  cp.note,
  c.name as city,
  c.country
from public.transport_checkpoints cp
join public.transport_cities c on c.id = cp.city_id;

create or replace view public.public_transport_fleet as
select
  v.id,
  v.plate,
  v.description,
  v.verified_at,
  vc.label as class_label,
  vc.capacity_slots,
  vc.capacity_kg,
  round(vc.min_load_ratio * 100, 0) as target_percent
from public.transport_vehicles v
join public.transport_vehicle_classes vc on vc.id = v.class_id
where v.active and v.verification_status = 'verified' and not v.is_sample;

-- Views read with owner privileges, which is why they must expose the
-- narrowest columns the product actually shows: no recipient, no phone, no
-- workspace id, nothing that identifies a customer.
alter view public.public_transport_corridors owner to postgres;
alter view public.public_transport_stops owner to postgres;
alter view public.public_transport_runs owner to postgres;
alter view public.public_transport_checkpoints owner to postgres;
alter view public.public_transport_fleet owner to postgres;

grant select on public.public_transport_corridors to anon, authenticated;
grant select on public.public_transport_stops to anon, authenticated;
grant select on public.public_transport_runs to anon, authenticated;
grant select on public.public_transport_checkpoints to anon, authenticated;
grant select on public.public_transport_fleet to anon, authenticated;

-- Every transport function is SECURITY DEFINER and lives in `public`, and this
-- project hands EXECUTE to anon, authenticated and service_role the moment a
-- function is created. Revoking from PUBLIC alone therefore closes nothing: the
-- explicit role grants survive it. The roles have to be revoked by name.
--
-- Two of these mutate base tables and carry no caller check of their own — they
-- are internal, reached only from the guarded entrypoints below, which run as the
-- owner, so their own EXECUTE can be taken away from every API role entirely.
revoke all on function public.transport_apply_quorum(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.transport_release_capacity(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.transport_stop_sequence(uuid, uuid) from public, anon;
revoke all on function public.transport_new_tracking_code() from public, anon;
revoke all on function public.transport_direct_distance_km(numeric, numeric, numeric, numeric)
  from public, anon;
-- Both take a whole transport_departures row, which is admin-only, so a caller
-- outside the schema has nothing to feed them. They are revoked anyway: the load
-- meter reaches them through the public view, never through the API.
revoke all on function public.transport_load_ratio(public.transport_departures)
  from public, anon;
revoke all on function public.transport_governing_dimension(public.transport_departures)
  from public, anon;

-- The public surface: one anonymous-readable RPC for market offers, and the two
-- customer entrypoints. Everything else checks is_platform_admin() inside and is
-- kept off `anon` entirely; `service_role` gets the sweep so a cron job can run
-- it without an admin session.
grant execute on function public.transport_offers_for_city(uuid) to anon, authenticated;
revoke all on function public.transport_offers_for_city(uuid) from service_role;

revoke all on function public.transport_create_booking(
  uuid, uuid, text, integer, numeric, text, uuid, uuid, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.transport_create_booking(
  uuid, uuid, text, integer, numeric, text, uuid, uuid, text, text, text, uuid, uuid
) to authenticated;

revoke all on function public.transport_cancel_booking(uuid, text) from public, anon;
grant execute on function public.transport_cancel_booking(uuid, text) to authenticated;

revoke all on function public.transport_confirm_fee(uuid, text, text) from public, anon;
revoke all on function public.transport_approve_load(uuid, text) from public, anon;
revoke all on function public.transport_advance_booking(uuid, text, text) from public, anon;
revoke all on function public.transport_advance_departure(uuid, text) from public, anon;
revoke all on function public.transport_record_checkpoint(uuid, uuid, text) from public, anon;
revoke all on function public.transport_cancel_departure(uuid, text) from public, anon;
revoke all on function public.transport_evaluate_departures() from public, anon;
grant execute on function public.transport_confirm_fee(uuid, text, text) to authenticated;
grant execute on function public.transport_approve_load(uuid, text) to authenticated;
grant execute on function public.transport_advance_booking(uuid, text, text) to authenticated;
grant execute on function public.transport_advance_departure(uuid, text) to authenticated;
grant execute on function public.transport_record_checkpoint(uuid, uuid, text) to authenticated;
grant execute on function public.transport_cancel_departure(uuid, text) to authenticated;
grant execute on function public.transport_evaluate_departures() to authenticated, service_role;

-- ── 17. RLS ──────────────────────────────────────────────────────────────────

alter table public.transport_cities enable row level security;
alter table public.transport_vehicle_classes enable row level security;
alter table public.transport_vehicles enable row level security;
alter table public.transport_routes enable row level security;
alter table public.transport_route_stops enable row level security;
alter table public.transport_departures enable row level security;
alter table public.transport_checkpoints enable row level security;
alter table public.transport_bookings enable row level security;
alter table public.transport_booking_events enable row level security;

create policy "transport cities admin all" on public.transport_cities
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport classes admin all" on public.transport_vehicle_classes
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport vehicles admin all" on public.transport_vehicles
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport routes admin all" on public.transport_routes
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport stops admin all" on public.transport_route_stops
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport departures admin all" on public.transport_departures
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "transport checkpoints admin all" on public.transport_checkpoints
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- A customer reads their own shipments; staff read everything. There is no
-- insert or update policy on purpose: bookings are created by
-- transport_create_booking and moved by the admin functions, so the fee and
-- capacity rules cannot be stepped around from a client.
create policy "transport bookings owner read" on public.transport_bookings
  for select to authenticated
  using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

create policy "transport events owner read" on public.transport_booking_events
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.transport_bookings b
      where b.id = transport_booking_events.booking_id
        and public.is_workspace_member(b.workspace_id)
    )
  );

-- ── 18. updated_at triggers ──────────────────────────────────────────────────

drop trigger if exists set_updated_at on public.transport_cities;
create trigger set_updated_at before update on public.transport_cities
  for each row execute function public.touch_updated_at();

drop trigger if exists set_updated_at on public.transport_vehicle_classes;
create trigger set_updated_at before update on public.transport_vehicle_classes
  for each row execute function public.touch_updated_at();

drop trigger if exists set_updated_at on public.transport_vehicles;
create trigger set_updated_at before update on public.transport_vehicles
  for each row execute function public.touch_updated_at();

drop trigger if exists set_updated_at on public.transport_routes;
create trigger set_updated_at before update on public.transport_routes
  for each row execute function public.touch_updated_at();

drop trigger if exists set_updated_at on public.transport_departures;
create trigger set_updated_at before update on public.transport_departures
  for each row execute function public.touch_updated_at();

drop trigger if exists set_updated_at on public.transport_bookings;
create trigger set_updated_at before update on public.transport_bookings
  for each row execute function public.touch_updated_at();

-- ── 19. Reference data ───────────────────────────────────────────────────────
-- A city and a vehicle size are facts, not claims, so they are real rows:
-- is_sample is false for everything in this section. The network itself — the
-- vehicles, corridors, runs and shipments below — has not been announced, so
-- every row there carries is_sample and the booking RPC refuses to sell it.

insert into public.transport_cities (name, country, latitude, longitude)
values
  ('Harare',          'Zimbabwe', -17.8317, 31.0457),
  ('Chinhoyi',        'Zimbabwe', -17.3667, 30.2000),
  ('Bindura',         'Zimbabwe', -17.3081, 31.3336),
  ('Marondera',       'Zimbabwe', -18.1853, 30.9817),
  ('Rusape',          'Zimbabwe', -18.5170, 32.1290),
  ('Mutare',          'Zimbabwe', -18.9707, 32.6709),
  ('Kwekwe',          'Zimbabwe', -18.9350, 29.8060),
  ('Gweru',           'Zimbabwe', -19.4500, 29.8500),
  ('Shurugwi',        'Zimbabwe', -19.6667, 30.0000),
  ('Masvingo',        'Zimbabwe', -20.0632, 30.8277),
  ('Bulawayo',        'Zimbabwe', -20.1525, 28.5817),
  ('Lupane',          'Zimbabwe', -18.9360, 27.8360),
  ('Hwange',          'Zimbabwe', -18.3700, 26.5000),
  ('Victoria Falls',  'Zimbabwe', -17.8340, 25.8418)
on conflict (name, country) do nothing;

-- The load target is the whole economics of pooling, and it is a function of
-- size: a motorbike is worth sending nearly full because it is cheap to send,
-- a big truck is worth sending half-full because it is expensive to wait for.
insert into public.transport_vehicle_classes
  (label, capacity_slots, capacity_kg, min_load_ratio, default_backstop_days)
values
  ('Motorbike',           4,    40.00, 0.750, 2),
  ('Saloon',              8,   120.00, 0.650, 3),
  ('Bakkie',             14,   800.00, 0.600, 3),
  ('Light truck (3 t)',  28,  3000.00, 0.550, 4),
  ('Rigid truck (8 t)',  60,  8000.00, 0.450, 5),
  ('Tipper (15 t)',       6, 15000.00, 0.700, 5)
on conflict (label) do nothing;

-- ── 20. Specimen network ────────────────────────────────────────────────────

with c as (
  select name, id from public.transport_cities where country = 'Zimbabwe'
)
insert into public.transport_routes
  (code, name, origin_city_id, destination_city_id,
   fare_per_slot, fare_per_kg, fare_final_mile, currency, status, is_sample)
select r.code, r.name, o.id, d.id,
       r.per_slot, r.per_kg, r.final_mile, 'USD', 'published', true
  from (values
    ('A1-E',   'Harare – Mutare',            'Harare',   'Mutare',         6.50, 0.045,  8.00),
    ('A1-W',   'Mutare – Harare',            'Mutare',   'Harare',         6.50, 0.045,  8.00),
    ('A5-S',   'Harare – Bulawayo',          'Harare',   'Bulawayo',       8.00, 0.055, 10.00),
    ('A5-N',   'Bulawayo – Harare',          'Bulawayo', 'Harare',         8.00, 0.055, 10.00),
    ('A4-SE',  'Gweru – Masvingo',           'Gweru',    'Masvingo',       5.00, 0.040,  7.00),
    ('A4-NW',  'Masvingo – Gweru',           'Masvingo', 'Gweru',          5.00, 0.040,  7.00),
    ('A6-NW',  'Bulawayo – Victoria Falls',  'Bulawayo', 'Victoria Falls', 11.00, 0.075, 14.00)
  ) as r(code, name, origin, destination, per_slot, per_kg, final_mile)
  join c o on o.name = r.origin
  join c d on d.name = r.destination
on conflict (code) do nothing;

-- Distances are computed from the coordinates rather than typed in, and are
-- straight-line: the UI labels them "direct" and must never imply a road mile.
update public.transport_routes r
   set direct_distance_km = public.transport_direct_distance_km(
         o.latitude, o.longitude, d.latitude, d.longitude)
  from public.transport_cities o, public.transport_cities d
 where o.id = r.origin_city_id
   and d.id = r.destination_city_id
   and r.direct_distance_km is null;

with c as (
  select name, id from public.transport_cities where country = 'Zimbabwe'
)
insert into public.transport_route_stops (route_id, city_id, sequence, dwell_minutes)
select r.id, cy.id, s.seq, s.dwell
  from (values
    ('A1-E',  'Harare',         1,  0), ('A1-E',  'Marondera', 2, 30),
    ('A1-E',  'Rusape',         3, 30), ('A1-E',  'Mutare',    4, 45),
    ('A1-W',  'Mutare',         1,  0), ('A1-W',  'Rusape',    2, 30),
    ('A1-W',  'Marondera',      3, 30), ('A1-W',  'Harare',    4, 45),
    ('A5-S',  'Harare',         1,  0), ('A5-S',  'Chinhoyi',  2, 30),
    ('A5-S',  'Kwekwe',         3, 30), ('A5-S',  'Gweru',     4, 45),
    ('A5-S',  'Bulawayo',       5,  0),
    ('A5-N',  'Bulawayo',       1,  0), ('A5-N',  'Gweru',     2, 45),
    ('A5-N',  'Kwekwe',         3, 30), ('A5-N',  'Chinhoyi',  4, 30),
    ('A5-N',  'Harare',         5,  0),
    ('A4-SE', 'Gweru',          1,  0), ('A4-SE', 'Shurugwi',  2, 30),
    ('A4-SE', 'Masvingo',       3,  0),
    ('A4-NW', 'Masvingo',       1,  0), ('A4-NW', 'Shurugwi',  2, 30),
    ('A4-NW', 'Gweru',          3,  0),
    ('A6-NW', 'Bulawayo',       1,  0), ('A6-NW', 'Lupane',    2, 30),
    ('A6-NW', 'Hwange',         3, 30), ('A6-NW', 'Victoria Falls', 4, 0)
  ) as s(code, city, seq, dwell)
  join public.transport_routes r on r.code = s.code
  join c cy on cy.name = s.city
on conflict (route_id, sequence) do nothing;

-- Cumulative straight-line offset from the corridor's origin, which is what the
-- longitudinal section and the map's traversed/remaining split need. The origin
-- stop is zero by definition.
update public.transport_route_stops s
   set stop_offset_km = public.transport_direct_distance_km(
         o.latitude, o.longitude, c.latitude, c.longitude)
  from public.transport_routes r,
       public.transport_cities o,
       public.transport_cities c
 where s.route_id = r.id
   and o.id = r.origin_city_id
   and c.id = s.city_id
   and s.stop_offset_km is null;

update public.transport_route_stops
   set stop_offset_km = 0.00
 where sequence = 1
   and (stop_offset_km is null or stop_offset_km <> 0.00);

-- A verified vehicle is a record, not a badge: it names who signed it off. A
-- reported checkpoint names who reported it. So the specimen vehicles and runs
-- can only be written once a real account exists to be named. With none, the
-- reference data above still lands and the fake network is skipped rather than
-- invented — no invented admin, no invented driver, no invented shipment.
do $$
declare
  v_actor uuid;
  v_workspace uuid;
  v_run_transit uuid;
  v_run_arrived uuid;
begin
  select id into v_actor from auth.users order by created_at limit 1;
  if v_actor is null then
    raise notice 'transport: cities, size classes and specimen corridors seeded. '
      'No accounts exist yet, so specimen vehicles, runs and checkpoints were '
      'skipped. Re-run this section after the first sign-up.';
    return;
  end if;

  insert into public.transport_vehicles (
    class_id, plate, description, verification_status,
    verified_at, verified_by, insurance_reference, is_sample
  )
  select vc.id, s.plate, s.description, s.status,
         case when s.status = 'verified' then now() - interval '30 days' end,
         case when s.status = 'verified' then v_actor end,
         case when s.status = 'verified' then 'SPECIMEN - no policy on file' end,
         true
    from (values
      ('Motorbike',         'SPC 4001', '125 cc with a locked top box',              'verified'),
      ('Saloon',            'SPC 4002', 'Saloon boot space',                         'verified'),
      ('Bakkie',            'SPC 4003', 'Single-cab bakkie with a canopy',           'verified'),
      ('Light truck (3 t)', 'SPC 4004', '3 t box truck',                             'verified'),
      ('Rigid truck (8 t)', 'SPC 4005', '8 t curtain-side',                          'verified'),
      ('Tipper (15 t)',     'SPC 4006', '15 t tipper - crusher dust, sand, chips',   'verified'),
      ('Rigid truck (8 t)', 'SPC 4007', '8 t curtain-side awaiting verification',    'pending')
    ) as s(class_label, plate, description, status)
    join public.transport_vehicle_classes vc on vc.label = s.class_label
  on conflict (plate) do nothing;

  -- One run in every state the map and the schedule have to render, with the
  -- load figures chosen so each one actually satisfies the state it is in:
  -- 'rolling' is past its target, 'overdue' is past its backstop and short,
  -- 'expired' is past its backstop and empty.
  with spec as (
    select r.id as route_id, vv.id as vehicle_id, vc.id as class_id,
           vc.capacity_slots, vc.capacity_kg, vc.min_load_ratio,
           vc.default_backstop_days, s.status, s.booked_slots, s.booked_kg,
           now() + make_interval(hours => s.dept_hours) as planned
      from (values
        ('A5-S',  'SPC 4003',   72,  6,   210.00, 'open'),
        ('A1-E',  'SPC 4002',   48,  6,    40.00, 'quorum_met'),
        ('A1-W',  'SPC 4004',   96, 12,  1200.00, 'open'),
        ('A5-N',  'SPC 4003',   96,  5,   260.00, 'open'),
        ('A5-S',  'SPC 4004',  144,  2,    90.00, 'open'),
        ('A4-SE', 'SPC 4006',    6,  2, 11000.00, 'rolling'),
        ('A5-N',  'SPC 4005',  -24, 44,  6100.00, 'in_transit'),
        ('A6-NW', 'SPC 4003',  -48, 10,   130.00, 'at_destination'),
        ('A4-SE', 'SPC 4003', -120,  4,   300.00, 'overdue'),
        ('A6-NW', 'SPC 4004', -144,  0,     0.00, 'expired')
      ) as s(route_code, plate, dept_hours, booked_slots, booked_kg, status)
      join public.transport_routes r on r.code = s.route_code
      join public.transport_vehicles vv on vv.plate = s.plate
      join public.transport_vehicle_classes vc on vc.id = vv.class_id
  )
  insert into public.transport_departures (
    route_id, vehicle_id, vehicle_class_id, planned_departure_at, booking_cutoff_at,
    backstop_at, target_load_ratio, capacity_slots, capacity_kg,
    booked_slots, booked_kg, status, departed_at, arrived_at, is_sample
  )
  select route_id, vehicle_id, class_id, planned, planned - interval '12 hours',
         planned + make_interval(days => default_backstop_days),
         min_load_ratio, capacity_slots, capacity_kg,
         booked_slots, booked_kg, status,
         case when spec.status in ('in_transit', 'at_destination', 'closed')
              then spec.planned end,
         case when spec.status in ('at_destination', 'closed')
              then spec.planned + interval '1 day' end,
         true
    from spec
   where not exists (
     select 1 from public.transport_departures where is_sample
   );

  select dep.id into v_run_transit
    from public.transport_departures dep
   where dep.is_sample and dep.status = 'in_transit'
   order by dep.planned_departure_at desc limit 1;

  select dep.id into v_run_arrived
    from public.transport_departures dep
   where dep.is_sample and dep.status = 'at_destination'
   order by dep.planned_departure_at desc limit 1;

  -- Checkpoints are what "live" means here: a person tapped the place the
  -- vehicle actually reached. Nothing between these points is drawn as fact.
  if v_run_transit is not null then
    insert into public.transport_checkpoints (
      departure_id, city_id, latitude, longitude, sequence, reported_at, reported_by, note
    )
    select dep.id, c.id, c.latitude, c.longitude, s.seq,
           dep.planned_departure_at + make_interval(hours => s.after_hours),
           v_actor, s.note
      from public.transport_departures dep
      join (values
        (1, 'Bulawayo',  0, 'Cleared the Bulawayo hub'),
        (2, 'Gweru',     5, 'Dwell at the Gweru hub'),
        (3, 'Kwekwe',   11, 'Last reported position')
      ) as s(seq, city, after_hours, note) on true
      join public.transport_cities c on c.name = s.city and c.country = 'Zimbabwe'
     where dep.id = v_run_transit
    on conflict (departure_id, sequence) do nothing;
  end if;

  if v_run_arrived is not null then
    insert into public.transport_checkpoints (
      departure_id, city_id, latitude, longitude, sequence, reported_at, reported_by, note
    )
    select dep.id, c.id, c.latitude, c.longitude, s.seq,
           dep.planned_departure_at + make_interval(hours => s.after_hours),
           v_actor, s.note
      from public.transport_departures dep
      join (values
        (1, 'Bulawayo',       0, 'Cleared the Bulawayo hub'),
        (2, 'Lupane',         6, 'Toll gate'),
        (3, 'Hwange',        13, 'Refuel stop'),
        (4, 'Victoria Falls', 22, 'Arrived at the Falls hub')
      ) as s(seq, city, after_hours, note) on true
      join public.transport_cities c on c.name = s.city and c.country = 'Zimbabwe'
     where dep.id = v_run_arrived
    on conflict (departure_id, sequence) do nothing;
  end if;

  -- One tracked shipment, so /track has a real trail instead of a stub on a
  -- fresh install. The fee is what the published formula gives for 2 slots on
  -- this corridor, and it is waived: no money moved, so nothing claims it did.
  select id into v_workspace from public.workspaces order by created_at limit 1;
  if v_workspace is not null and v_run_transit is not null then
    insert into public.transport_bookings (
      tracking_code, workspace_id, departure_id, mode, slots, weight_kg,
      contents, pickup_city_id, dropoff_city_id, recipient_name, fulfilment,
      fee, currency, fee_status, status
    )
    select 'SS-SPECIM1', v_workspace, dep.id, 'parcel', 2, 38.00,
           'Total station and prisms (specimen)',
           b.id, a.id, 'Specimen recipient', 'hub_collection',
           16.00, r.currency, 'waived', 'in_transit'
      from public.transport_departures dep
      join public.transport_routes r on r.id = dep.route_id
      join public.transport_cities b on b.name = 'Bulawayo' and b.country = 'Zimbabwe'
      join public.transport_cities a on a.name = 'Harare' and a.country = 'Zimbabwe'
     where dep.id = v_run_transit
    on conflict (tracking_code) do nothing;

    insert into public.transport_booking_events (
      booking_id, from_status, to_status, actor_kind, actor_id, note
    )
    select b.id, e.from_status, e.to_status, 'platform', v_actor, e.note
      from public.transport_bookings b
      join (values
        (null::text, 'confirmed',  'Specimen fee waived - no payment was taken'),
        ('confirmed', 'picked_up', 'Collected at the Bulawayo hub'),
        ('picked_up', 'in_transit', 'Loaded and rolling')
      ) as e(from_status, to_status, note) on true
     where b.tracking_code = 'SS-SPECIM1'
       and not exists (
         select 1 from public.transport_booking_events x where x.booking_id = b.id
       );
  end if;
end;
$$;
