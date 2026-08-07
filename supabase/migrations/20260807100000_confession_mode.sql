-- Prompt-mode routing: a `mode` travels with every confession and decides
-- which pinned prompt version answers it (PROMPT_BY_MODE in the generate-
-- verdict edge function — dashboard-managed, updated alongside this paste).
-- Today every mode resolves to the same prompt, so nothing changes
-- behaviourally; the point is that a second prompt later is one dashboard
-- line — no migration, no client deploy.
--
-- THIS IS A GENERAL ROUTING LAYER, NOT ROUND CODE. Venue-specific prompts,
-- experiments, seasonal variants all use it. The (shelved) round was to be
-- the first caller, not the reason. Do not remove it as dead round code.
--
-- Storing the mode is the expensive-to-retrofit part: without the column you
-- can never ask whether verdicts from one prompt get shared more than
-- another — the rows would be indistinguishable.

alter table public.confessions
  add column if not exists mode text not null default 'solo';

-- create_confession gains p_mode — as a CHANGED SIGNATURE (drop + recreate),
-- NOT an overload. An overload would leave both the 4- and 5-parameter
-- versions in place, and PostgREST then rejects the deployed edge function's
-- 4-argument call as ambiguous (PGRST203: cannot choose best candidate).
-- Dropping the old signature and giving p_mode a DEFAULT keeps that caller
-- working unchanged: PostgREST fills the default until the edge function is
-- updated to pass mode explicitly. Both statements run in one paste, so
-- there is no window with no function at all.
drop function if exists public.create_confession(text, text, text, text);

create or replace function public.create_confession(
  p_confession text,
  p_verdict text,
  p_source text,
  p_status text,
  p_mode text default 'solo'
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_subject bigint;
begin
  v_status := case when p_status in ('pending', 'blocked') then p_status else 'pending' end;
  insert into public.confessions (confession_text, verdict_text, source, status, mode)
  values (
    p_confession,
    p_verdict,
    coalesce(nullif(btrim(p_source), ''), 'direct'),
    v_status,
    -- Hard default to solo: empty/whitespace/missing all normalise. The DB
    -- stores what the edge function resolved; it does not validate against a
    -- mode list — the edge function's PROMPT_BY_MODE map is the gate.
    coalesce(nullif(btrim(p_mode), ''), 'solo')
  )
  returning subject_number into v_subject;
  return v_subject;
end;
$$;

-- Same grant posture as the original (20260628093000): anon only.
revoke all on function public.create_confession(text, text, text, text, text) from public;
grant execute on function public.create_confession(text, text, text, text, text) to anon;
