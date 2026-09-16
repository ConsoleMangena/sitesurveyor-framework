-- Per-workspace AI provider registry.
--
-- Each row is an OpenAI-compatible chat-completions endpoint the user can
-- point the AI agent at. The "built-in" NaraRouter provider stays in code
-- (backend/supabase/functions/_shared/ai-agent.ts) and is the default;
-- rows here extend the allowlist with the user's own keys + base URLs —
-- e.g. OpenAI, Anthropic (via the OpenAI-compat proxy), Azure OpenAI,
-- Together, Groq, Ollama, OpenCode, LM Studio, etc.
--
-- The selected model id is encoded as "<provider-id>:<model>" so the agent
-- can look the provider up by id, hit the right base_url with the right
-- api_key, and forward the model name verbatim. Built-in NaraRouter keeps
-- using its current shape ("laguna-s-2.1", "agnes-2.5-flash") for backward
-- compat.

create table public.workspace_ai_providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Short, user-facing tag used in the model id (e.g. "openai", "groq",
  -- "ollama", "opencode"). Lowercase letters/digits/hyphens. Unique per
  -- workspace so the agent can disambiguate "<tag>:<model>" cleanly.
  tag text not null,
  -- Display name shown in the settings page + assistant model picker.
  label text not null,
  -- OpenAI-compatible chat-completions base URL. The agent POSTs
  -- "{base_url}/chat/completions" and an empty / trailing-slash segment is
  -- tolerated. Examples:
  --   https://api.openai.com/v1
  --   https://api.groq.com/openai/v1
  --   http://localhost:11434/v1   (Ollama)
  base_url text not null,
  -- Provider API key. Stored as a Supabase Vault secret reference so it
  -- never appears in plain text on a row fetched via the PostgREST API.
  -- The UI also accepts plaintext for the convenience of local dev; the
  -- Edge Function resolves either form into a real bearer token at call
  -- time. See notes at the bottom of this file.
  api_key_secret_id uuid,
  api_key text,
  -- Optional model id the provider should default to when the user picks
  -- the provider without naming a specific model. Used by the assistant
  -- "model = <provider-tag>" shorthand.
  default_model text,
  enabled boolean not null default true,
  -- Drag-to-reorder; lower = earlier in the picker.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, tag)
);

create index if not exists idx_workspace_ai_providers_workspace
  on public.workspace_ai_providers (workspace_id, sort_order);

-- RLS: only workspace members can read, only admins can write. We mirror
-- the pattern used by other workspace-scoped tables in this schema.
alter table public.workspace_ai_providers enable row level security;

create policy workspace_ai_providers_select
  on public.workspace_ai_providers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_ai_providers.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy workspace_ai_providers_admin_write
  on public.workspace_ai_providers
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_ai_providers.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_ai_providers.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('owner', 'admin')
    )
  );

-- updated_at maintenance (mirrors the trigger pattern used elsewhere).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_ai_providers_updated_at on public.workspace_ai_providers;
create trigger trg_workspace_ai_providers_updated_at
  before update on public.workspace_ai_providers
  for each row execute function public.touch_updated_at();

-- Notes for ops:
-- 1. `api_key_secret_id` is reserved for a future Supabase Vault integration
--    so secrets stay out of the PostgREST-readable row. For now the plain
--    `api_key` column is the source of truth and is fetched through the
--    service-role client inside the Edge Function. RLS hides it from
--    non-admin workspace members via the policy above, but admins on the
--    workspace CAN see it. That is intentional for v1 — the settings UI is
--    gated to admins and the key never leaves the trust boundary.
-- 2. Built-in NaraRouter continues to work without a row. The agent
--    resolves "laguna-s-2.1" (and free model names) to the
--    env-supplied key. Custom providers only kick in when the selected model
--    id starts with one of the registered tags.
