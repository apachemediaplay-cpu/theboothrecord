-- Verdict timeout recovery. create_confession writes the row BEFORE the edge
-- function calls the AI, so a client timeout does NOT mean nothing happened —
-- the verdict may exist with only the response lost in transit. Showing
-- "Nothing on record" then would be a lie and breeds duplicate confessions.
--
-- get_share_verdict CANNOT serve this check: it is uuid-keyed (deliberately no
-- subject-number path), and on timeout the client holds neither the uuid nor the
-- subject number — both die with the lost response. The client has exactly its
-- confession text + source + session id, so recovery keys on those.
--
-- OWNERSHIP CHECK — deliberately strict, because on timeout the row's session_id
-- is ALWAYS null (tag_confession never ran), leaving the confession text as the
-- only real secret, and short confessions are not secret ("test", "sorry" exist
-- in the DB many times over). Every condition below must hold:
--   * confession length ≥ 12 chars — shorter returns nothing (cheap to retype;
--     showing someone else's verdict is not).
--   * EXACT confession text match.
--   * source match — the row carries it from create time; narrows text
--     collisions to a single venue.
--   * 5-minute window — recovery fires ~40s after submission, not later.
--   * session_id null-or-mine.
--   * EXACTLY ONE row matches — two matches means two people typed the same
--     thing at the same venue within minutes; return nothing rather than guess.
-- A successful match CLAIMS the row (stamps session_id) so it cannot be
-- recovered again by a different session.

-- 1. Recovery lookup + claim. ----------------------------------------------------
create or replace function public.recover_verdict(
  _confession text,
  _source text,
  _session_id text
) returns table (subject_number bigint, verdict_text text, source text, stamp_venue boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  _src text := coalesce(nullif(btrim(_source), ''), 'direct');
  _match_count integer;
  _row record;
begin
  if _confession is null or char_length(_confession) < 12 then
    return; -- short confessions are refused outright — failure screen
  end if;

  -- Predicate must stay IDENTICAL in both statements below.
  select count(*) into _match_count
    from public.confessions c2
   where c2.confession_text = _confession
     and c2.source = _src
     and (c2.session_id is null or c2.session_id = _session_id)
     and c2.verdict_text is not null
     and btrim(c2.verdict_text) <> ''
     and c2.status <> 'blocked'
     and c2.created_at > now() - interval '5 minutes';

  if _match_count <> 1 then
    return; -- zero OR ambiguous — never guess; the failure screen shows
  end if;

  update public.confessions c
     set session_id = coalesce(c.session_id, nullif(btrim(_session_id), ''))
   where c.id = (
     select c2.id
       from public.confessions c2
      where c2.confession_text = _confession
        and c2.source = _src
        and (c2.session_id is null or c2.session_id = _session_id)
        and c2.verdict_text is not null
        and btrim(c2.verdict_text) <> ''
        and c2.status <> 'blocked'
        and c2.created_at > now() - interval '5 minutes'
   )
   returning c.subject_number, c.verdict_text, c.source, c.stamp_venue
    into _row;

  if _row.subject_number is null then
    return;
  end if;
  return query
    select _row.subject_number, _row.verdict_text, _row.source, _row.stamp_venue;
end;
$$;

revoke all on function public.recover_verdict(text, text, text) from public, anon;
grant execute on function public.recover_verdict(text, text, text) to anon;

-- 2. booth_events whitelist: + verdict_timeout (the 35s ceiling fired) and
-- verdict_recovery (meta.outcome: recovered | not_found | error). Same body as
-- 20260801080000 otherwise; same signature, so create-or-replace suffices.
create or replace function public.log_booth_event(
  _event_type text,
  _source     text,
  _session_id text,
  _is_test    boolean default false,
  _physical   boolean default false,
  _meta       jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _event_type not in (
    'share_link', 'share_card', 'confess_again', 'verdict_timeout', 'verdict_recovery'
  ) then
    raise exception 'unknown booth event type: %', coalesce(_event_type, '(null)');
  end if;
  insert into public.booth_events (event_type, source, session_id, is_test, physical, meta)
  values (
    _event_type,
    coalesce(nullif(btrim(_source), ''), 'direct'),
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_physical, false),
    _meta
  );
end;
$$;

revoke all on function public.log_booth_event(text, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.log_booth_event(text, text, text, boolean, boolean, jsonb) to anon;
