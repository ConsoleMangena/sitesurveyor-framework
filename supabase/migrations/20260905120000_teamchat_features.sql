-- TeamChat features: persisted edit timestamp on chat messages.
--
-- Adds an `edited_at` column so client UIs can show an "(edited)" marker
-- after the author updates their message content. NULL means unedited.
--
-- Safe additive migration; no RLS changes required (existing policies already
-- permit the message author to update their own row).
alter table public.chat_messages
  add column if not exists edited_at timestamptz;

comment on column public.chat_messages.edited_at is
  'When the message was last edited by its author. NULL means unedited.';
