-- Observability: one row per AI agent run (tool trace + outcome).
create table public.ai_run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  project_id uuid,
  model text not null,
  context text not null default 'dashboard',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rounds int not null default 0,
  tool_calls jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  final_text text,
  outcome text check (outcome in ('success','error','cancelled')) not null default 'success',
  error text
);

create index if not exists idx_ai_run_logs_user_started
  on public.ai_run_logs (user_id, started_at desc);
create index if not exists idx_ai_run_logs_conversation
  on public.ai_run_logs (conversation_id, started_at desc);
