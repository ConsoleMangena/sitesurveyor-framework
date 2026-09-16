-- Structured per-conversation memory for the AI agent.
-- Persists discrete facts (active layer, datum, stated defaults/preferences) as
-- they are learned, keyed by conversation, so they survive MAX_HISTORY_TURNS
-- truncation of the free-text summary. Complements ai_conversations.summary.

create table public.ai_memory (
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, key)
);

create index if not exists idx_ai_memory_conversation_updated
  on public.ai_memory (conversation_id, updated_at desc);
