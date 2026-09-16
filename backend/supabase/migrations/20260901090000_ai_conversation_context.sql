-- Separate CAD-workspace AI chats from dashboard chats.
-- Existing rows default to 'dashboard'; the CAD panel creates 'cad' rows.

alter table public.ai_conversations
  add column context text not null default 'dashboard';

alter table public.ai_conversations
  add constraint ai_conversations_context_check
  check (context in ('dashboard', 'cad'));

create index if not exists idx_ai_conversations_user_updated_context
  on public.ai_conversations (user_id, context, updated_at desc);