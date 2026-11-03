-- Hybrid full-file anchoring (ssv2).
--
-- On-chain a single Memo carries the file digest plus the digest of a chunk
-- manifest. The manifest and the encrypted-at-rest chunk objects stay in
-- Supabase, so the chain proves which bytes existed without storing them.

create table public.file_anchor_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  mode text not null check (mode in ('hash', 'full_file')),
  bucket_name text not null default 'workspace-private'
    check (bucket_name in ('workspace-private', 'workspace-public')),
  network text not null,
  wallet_address text,
  status text not null default 'preparing'
    check (status in (
      'preparing', 'uploading', 'ready', 'submitting',
      'submitted', 'confirming', 'anchored', 'failed', 'cancelled'
    )),
  file_name text not null,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  mime_type text,
  chunk_size integer check (chunk_size is null or chunk_size > 0),
  chunk_count integer check (chunk_count is null or chunk_count > 0),
  uploaded_chunks integer not null default 0 check (uploaded_chunks >= 0),
  file_hash text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  manifest_hash text check (manifest_hash is null or manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb,
  manifest_storage_path text,
  memo text,
  tx_signature text,
  tx_slot bigint,
  fee_lamports bigint check (fee_lamports is null or fee_lamports >= 0),
  error_message text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'mismatch')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (uploaded_chunks <= coalesce(chunk_count, uploaded_chunks))
);

create index file_anchor_operations_attachment_idx
  on public.file_anchor_operations (attachment_id, created_at desc);

create index file_anchor_operations_workspace_created_idx
  on public.file_anchor_operations (workspace_id, created_at desc);

create unique index file_anchor_operations_signature_idx
  on public.file_anchor_operations (tx_signature)
  where tx_signature is not null;

create table public.file_anchor_chunks (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.file_anchor_operations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  bucket_name text not null check (bucket_name in ('workspace-private', 'workspace-public')),
  storage_path text not null,
  size_bytes integer not null check (size_bytes > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  uploaded_at timestamptz not null default now(),
  unique (operation_id, chunk_index)
);

create index file_anchor_chunks_operation_idx
  on public.file_anchor_chunks (operation_id, chunk_index);

alter table public.attachments
  add column if not exists anchor_mode text
    check (anchor_mode is null or anchor_mode in ('hash', 'full_file')),
  add column if not exists anchor_operation_id uuid
    references public.file_anchor_operations (id) on delete set null,
  add column if not exists anchor_fee_lamports bigint;

alter table public.file_anchor_operations enable row level security;
alter table public.file_anchor_chunks enable row level security;

create policy "file_anchor_operations_select_member"
  on public.file_anchor_operations for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_anchor_operations.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "file_anchor_operations_insert_owner"
  on public.file_anchor_operations for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_anchor_operations.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "file_anchor_operations_update_owner"
  on public.file_anchor_operations for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "file_anchor_operations_delete_owner"
  on public.file_anchor_operations for delete
  to authenticated
  using (created_by = auth.uid());

create policy "file_anchor_chunks_select_member"
  on public.file_anchor_chunks for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_anchor_chunks.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "file_anchor_chunks_write_owner"
  on public.file_anchor_chunks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.file_anchor_operations op
      where op.id = file_anchor_chunks.operation_id
        and op.created_by = auth.uid()
    )
  );

create policy "file_anchor_chunks_delete_owner"
  on public.file_anchor_chunks for delete
  to authenticated
  using (
    exists (
      select 1 from public.file_anchor_operations op
      where op.id = file_anchor_chunks.operation_id
        and op.created_by = auth.uid()
    )
  );

-- Anchored proofs are historical evidence: an operation that reached the chain
-- may have its bookkeeping refreshed but never silently rewritten back to a
-- pre-submission state, and never deleted.
create or replace function public.protect_file_anchor_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('submitted', 'confirming', 'anchored') then
      raise exception 'An anchor record that reached Solana cannot be deleted';
    end if;
    return old;
  end if;

  if old.status in ('submitted', 'confirming', 'anchored')
    and new.status not in ('submitted', 'confirming', 'anchored', 'failed') then
    raise exception 'An anchor record that reached Solana cannot be reset';
  end if;
  if new.workspace_id is distinct from old.workspace_id
    or new.attachment_id is distinct from old.attachment_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Anchor ownership cannot be reassigned';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger file_anchor_operations_protect
  before update or delete on public.file_anchor_operations
  for each row execute function public.protect_file_anchor_operations();

-- Chunks are content-addressed evidence: once recorded they must not be
-- repointed at different bytes, otherwise the manifest no longer describes the
-- file the chain committed to. Draft operations may still discard chunks so an
-- interrupted run can be retried.
create or replace function public.protect_file_anchor_chunks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Anchor chunk records are immutable';
  end if;
  if exists (
    select 1 from public.file_anchor_operations op
    where op.id = old.operation_id
      and op.status in ('submitted', 'confirming', 'anchored')
  ) then
    raise exception 'Chunks covered by a Solana anchor cannot be removed';
  end if;
  return old;
end;
$$;

create trigger file_anchor_chunks_protect
  before update or delete on public.file_anchor_chunks
  for each row execute function public.protect_file_anchor_chunks();

comment on table public.file_anchor_operations is
  'One row per anchoring attempt: hash-only (ssv1) or hybrid full-file (ssv2).';
comment on column public.file_anchor_operations.manifest_hash is
  'SHA-256 of the canonical chunk manifest; the value written on-chain alongside the file digest.';
