-- Rollback for sql/39_credit_notes.sql
-- Stops new credit notes. Issued notes are GST records and are KEPT (table, counter,
-- freeze trigger); drop them by hand only if no note was ever issued:
--   drop table public.credit_notes; drop table public.credit_note_counters;
drop function if exists public.admin_issue_credit_note(text, uuid, text, text, jsonb, numeric, boolean);
