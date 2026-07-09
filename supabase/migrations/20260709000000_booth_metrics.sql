-- Booth metrics: per-venue completed-confession accuracy + soft share signal.
-- Data layer only. The confession INSERT stays in the generate-verdict edge function
-- (create_confession); these objects tag the row AFTER it exists and log share taps.
-- Does NOT touch generate-verdict, the verdict prompt (v45), or the gatekeeper (v14).
--
-- Applied via the Supabase SQL editor on 2026-07-09 (confirmed by the owner); this file
-- is repo parity/history, matching how the other migrations here are managed.

-- 1. Metadata columns on confessions ------------------------------------------
alter table public.confessions
  add column if not exists session_id text,
  add column if not exists is_test    boolean not null default false;

-- 2. Post-insert tag: set session_id + is_test on the just-created row --------
-- Anon-callable (the confess flow is anonymous). Idempotent: only tags a row that
-- hasn't been tagged yet (session_id is null), so a row can't be re-flagged later.
create or replace function public.tag_confession(
  _subject_number bigint,
  _session_id     text,
  _is_test        boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.confessions
     set session_id = coalesce(session_id, _session_id),
         is_test    = is_test or coalesce(_is_test, false)
   where subject_number = _subject_number
     and session_id is null;
end;
$$;

revoke all on function public.tag_confession(bigint, text, boolean) from public, anon;
grant execute on function public.tag_confession(bigint, text, boolean) to anon;

-- 3. Share-tap log (soft "share intent" signal — NOT reach/destination) -------
create table if not exists public.share_events (
  id         uuid primary key default gen_random_uuid(),
  source     text,
  session_id text,
  created_at timestamptz not null default now()
);

-- RLS on, NO policies: anon can neither read nor write directly. Inserts happen
-- ONLY through log_share() below (SECURITY DEFINER -> runs as owner, bypasses RLS).
alter table public.share_events enable row level security;

create or replace function public.log_share(
  _source     text,
  _session_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.share_events (source, session_id)
  values (nullif(btrim(_source), ''), nullif(btrim(_session_id), ''));
end;
$$;

revoke all on function public.log_share(text, text) from public, anon;
grant execute on function public.log_share(text, text) to anon;
