-- Rolling conversation memory for the SiteSurveyor AI agent.
-- `summary` holds dense notes about everything before the verbatim history
-- window; `summary_through` marks how far (by message created_at) the notes
-- cover, so both runtimes know which turns still need folding in.

alter table public.ai_conversations
  add column if not exists summary text not null default '';
alter table public.ai_conversations
  add column if not exists summary_through timestamptz;
