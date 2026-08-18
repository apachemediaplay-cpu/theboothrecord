-- THE FILING TIME, IN THE ROOM'S OWN CLOCK.
--
-- The story card's meta bar prints the time a confession was filed. On the
-- confessor's phone that works without any of this: Receiving stamps
-- sessionStorage.filedAt at the moment the verdict lands, and the card renders
-- it with the device's own getHours() — the device is AT the venue, so
-- device-local is venue-local.
--
-- /v/:id has neither half. It has a row, and the row has created_at in UTC.
-- Rendering that with the viewer's local getters is right only while the viewer
-- is standing in the same room; a link opened the next morning, or in another
-- city, would print the wrong hour as the filing hour. That is the same class
-- of false claim as stamping a venue on a confession made somewhere else: the
-- time on a card is a claim about WHEN, the way the stamp is a claim about
-- WHERE.
--
-- THE FIX IS NOT A VENUE TIMEZONE TABLE. The device that files the confession
-- already knows the venue's wall clock — that is precisely why filedAt works —
-- so it records its own UTC offset alongside the row. In kiosk the filing
-- device IS the booth tablet, sitting in the venue. No column to maintain per
-- venue, no lookup, nothing to keep in sync, and it stays correct for a venue
-- that moves, a pop-up, or a city that changes its DST rules.
--
-- Nullable, and null is FINE: every row that predates this reads back as
-- "offset unknown", and the card falls back to rendering created_at in the
-- viewer's own zone — today's behaviour, correct in the room, no worse than
-- today anywhere else.
--
-- Touches nothing else: no RLS change, no create_confession change, no edge
-- function change, no moderation change.

begin;

-- ── 1. The column ────────────────────────────────────────────────────────────
-- Minutes EAST of UTC, matching -Date.getTimezoneOffset() (Melbourne in
-- winter = 600). smallint spans ±32767; the real range is -720..840 (UTC-12 to
-- UTC+14) and the writer below clamps to it.
alter table public.confessions
  add column if not exists filed_offset_minutes smallint;

comment on column public.confessions.filed_offset_minutes is
  'UTC offset in minutes (east positive) of the device that FILED this confession, captured by tag_confession at verdict time. Null = unknown (rows predating this, or an untagged row). Used to render the filing time in the room''s own clock on cards built away from the venue.';

-- ── 2. tag_confession gains the offset ───────────────────────────────────────
-- DROP-THEN-CREATE, not CREATE OR REPLACE: a new parameter makes a new
-- signature, and replace would leave the 4-arg function in place as a second
-- overload that silently keeps winning for 4-arg callers.
--
-- SAFE TO PASTE BEFORE THE CLIENT SHIPS. The new parameter has a default, so a
-- currently-deployed client calling with four arguments still resolves to this
-- function and behaves exactly as it does today — it simply leaves the offset
-- null. There is no window in which tagging fails.
--
-- DEPENDS ON 20260817100000 (stamp_venue = physical only), whose line is
-- carried below so this file is a complete definition either way. If that
-- migration has not been pasted yet, pasting this one applies both rules; if it
-- has, this changes nothing about it.
drop function if exists public.tag_confession(bigint, text, boolean, boolean);

create function public.tag_confession(
  _subject_number bigint,
  _session_id     text,
  _is_test        boolean,
  _physical       boolean default false,
  _offset_minutes int     default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.confessions
     set session_id  = coalesce(session_id, _session_id),
         is_test     = is_test or coalesce(_is_test, false),
         physical    = physical or coalesce(_physical, false),
         -- A remote session cannot stamp the venue (see 20260817100000).
         stamp_venue = stamp_venue and coalesce(_physical, false),
         -- SET ONCE, like session_id: the first tag wins and nothing later can
         -- rewrite when a confession was filed. CLAMPED rather than constrained
         -- — a nonsense value from a broken clock becomes null instead of
         -- raising, because this whole call is fire-and-forget on the client
         -- and an error here would silently cost the session_id too.
         filed_offset_minutes = coalesce(
           filed_offset_minutes,
           case
             when _offset_minutes between -720 and 840 then _offset_minutes::smallint
             else null
           end
         )
   -- THE SAME SESSION MAY ALWAYS TAG ITS OWN ROW, whichever call lands first.
   -- This used to be a bare `session_id is null`, which made the tag lose a
   -- race it runs every single time on the booth: Receiving fires
   -- tagConfession and then navigates to /verdict, whose kiosk branch resolves
   -- the handoff uuid ON MOUNT — measured 5ms apart, both in flight, both
   -- carrying the SAME session id. resolve_share_id claims session_id when it
   -- lands (it accepts `null or equal`), and the old guard then matched zero
   -- rows, so physical AND is_test were dropped silently — the call is
   -- fire-and-forget, so nothing surfaced. A phone never hit it: there the
   -- uuid is resolved on a tap, minutes later.
   --
   -- A DIFFERENT session still cannot touch a claimed row, which is the part
   -- that matters: this is the same rule resolve_share_id has always used.
   where subject_number = _subject_number
     and (session_id is null or session_id = _session_id);
end;
$$;

-- Grants are destroyed by the drop — restate them for the NEW signature.
revoke all on function public.tag_confession(bigint, text, boolean, boolean, int) from public, anon;
grant execute on function public.tag_confession(bigint, text, boolean, boolean, int) to anon;

-- ── 3. get_share_verdict returns the time ────────────────────────────────────
-- Drop-then-create is FORCED here: the return type is a table, and Postgres
-- will not let CREATE OR REPLACE change one. Same shape as
-- 20260718000000_get_share_verdict_stamp_venue.sql, which added stamp_venue the
-- same way.
--
-- Still keyed ONLY by the unguessable uuid — no ownership check, no
-- subject_number path, unchanged from the day it was written. The two new
-- columns are metadata about the record, not about the person: created_at is
-- already implied by the wall's public feed, and an offset is a number of
-- minutes.
drop function if exists public.get_share_verdict(text);

create function public.get_share_verdict(_id text)
returns table (
  subject_number       bigint,
  confession_text      text,
  verdict_text         text,
  source               text,
  stamp_venue          boolean,
  created_at           timestamptz,
  filed_offset_minutes smallint
)
language sql
security definer
set search_path = public
stable
as $$
  select subject_number, confession_text, verdict_text, source, stamp_venue,
         created_at, filed_offset_minutes
    from public.confessions
   where id::text = _id
   limit 1;
$$;

-- Re-apply grants destroyed by the drop (mirrors 20260709010000_share_by_uuid.sql).
revoke all on function public.get_share_verdict(text) from public, anon;
grant execute on function public.get_share_verdict(text) to anon;

commit;
