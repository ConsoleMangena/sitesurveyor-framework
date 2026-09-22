-- Asset photos for the marketplace.
-- 1. assets.photos (ordered storage paths; index 0 = marketplace cover)
-- 2. public `asset-media` bucket (anon read, workspace-member writes)
-- 3. public_market_listings gains `photos` via a left join to assets

alter table public.assets
  add column if not exists photos text[] not null default '{}';

alter table public.assets
  drop constraint if exists assets_photos_max_six;

alter table public.assets
  add constraint assets_photos_max_six check (cardinality(photos) <= 6);

comment on column public.assets.photos is
  'Ordered photo paths in the public asset-media bucket; index 0 is the marketplace cover.';

insert into storage.buckets (id, name, public)
values ('asset-media', 'asset-media', true)
on conflict (id) do update set public = true;

drop policy if exists "asset_media_public_read" on storage.objects;
create policy "asset_media_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'asset-media');

drop policy if exists "asset_media_member_insert" on storage.objects;
create policy "asset_media_member_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'asset-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

drop policy if exists "asset_media_member_update" on storage.objects;
create policy "asset_media_member_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'asset-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
)
with check (
  bucket_id = 'asset-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

drop policy if exists "asset_media_member_delete" on storage.objects;
create policy "asset_media_member_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'asset-media'
  and public.is_workspace_member(public.path_first_segment_uuid(name))
);

drop view if exists public.public_market_listings cascade;
create view public.public_market_listings as
select
  ml.id,
  ml.name,
  ml.type,
  ml.condition,
  ml.price,
  ml.currency,
  ml.seller,
  ml.location,
  ml.description,
  ml.specs,
  ml.listing_type,
  ml.category,
  ml.latitude,
  ml.longitude,
  ml.created_at,
  coalesce(a.photos, '{}')::text[] as photos
from public.marketplace_listings ml
left join public.assets a on a.id = ml.asset_id;

grant select on public.public_market_listings to anon, authenticated;