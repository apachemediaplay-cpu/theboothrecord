-- Per-verdict share links, keyed by the confession's UNGUESSABLE uuid (public.confessions.id),
-- never the sequential subject_number. UUIDs aren't guessable, so /v/{uuid} and /og/{uuid}
-- can't be walked. A confessor sharing their OWN verdict is not us publishing it, so this is
-- NOT gated on moderation — the public wall stays approved-only (unchanged). Anonymity holds:
-- only verdict/venue are shown, never a name.
--
-- Data layer only. Does NOT touch the generate-verdict edge function, v45, or v14.
--
-- The one subtlety: the client only knows its sequential subject_number (the edge function
-- doesn't return the uuid). resolve_share_id() hands the confessor their uuid, and is
-- OWNERSHIP-GATED so it can't be used as a subject_number -> uuid oracle (which would re-open
-- enumeration). The read endpoint (get_share_verdict) is uuid-only and never takes an id.

-- 1. Resolve subject_number -> uuid, for the owner only. --------------------
-- Ownership proof: the row's verdict_text (an unmoderated verdict is NOT anon-readable, so a
-- subject_number-walker can't supply it) AND the unguessable session_id set at verdict time
-- (tag_confession), claimed here if still null. Returns the uuid as text, or null if unproven.
create or replace function public.resolve_share_id(
  _subject_number bigint,
  _session_id     text,
  _verdict        text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare _id text;
begin
  update public.confessions
     set session_id = coalesce(session_id, _session_id)
   where subject_number = _subject_number
     and verdict_text is not distinct from _verdict
     and (session_id is null or session_id = _session_id)
   returning id::text into _id;
  return _id;  -- null when ownership wasn't proven
end;
$$;

revoke all on function public.resolve_share_id(bigint, text, text) from public, anon;
grant execute on function public.resolve_share_id(bigint, text, text) to anon;

-- 2. Resolve uuid -> card fields. Keyed ONLY by the uuid (compared as text so a non-uuid
-- like '1' or a random number simply matches nothing — no cast error, no row). There is NO
-- subject_number read path here, so confession_text is never exposed by sequential id.
create or replace function public.get_share_verdict(_id text)
returns table (subject_number bigint, confession_text text, verdict_text text, source text)
language sql
security definer
set search_path = public
stable
as $$
  select subject_number, confession_text, verdict_text, source
    from public.confessions
   where id::text = _id
   limit 1;
$$;

revoke all on function public.get_share_verdict(text) from public, anon;
grant execute on function public.get_share_verdict(text) to anon;
