-- Separate CAD-workspace AI chats from dashboard chats.
-- Existing rows default to 'dashboard'; the CAD panel creates 'cad' rows.

alter table public.ai_conversations
  add column if not exists context text not null default 'dashboard';

-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."ai_conversations" drop constraint if exists "ai_conversations_context_check";
alter table public.ai_conversations
  add constraint ai_conversations_context_check
  check (context in ('dashboard', 'cad'));

create index if not exists idx_ai_conversations_user_updated_context
  on public.ai_conversations (user_id, context, updated_at desc);