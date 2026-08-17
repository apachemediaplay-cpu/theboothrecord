-- Venue stamp = FIRST-HAND ONLY.
--
-- "AS CHARGED AT <VENUE>" is a claim about where something happened. Until now
-- the only thing gating it was stamp_venue, which the verdict function sets
-- from a content classifier (illegal activity → no stamp) and which says
-- nothing about whether the person was ever in the room.
--
-- They frequently weren't. VerdictShare's YOUR TURN is `/confess?source=<venue>`
-- — deliberately, so a confession referred by a shared card is CREDITED to the
-- venue — and following it makes the recipient's own card read AS CHARGED AT a
-- bar they have never been to. Instagram and every other ?source=-only inbound
-- does the same thing.
--
-- THE SIGNAL ALREADY EXISTS AND IS ALREADY ON THE ROW. Printed table cards
-- always carry ?venue= (print spec); /k/:slug writes the same key on the booth
-- tablet; a ?source=-only link CLEARS it (see captureSourceFromUrl). That is
-- confessions.physical, written by this very function since the physical-flag
-- migration and — until now — read by nothing.
--
-- ATTRIBUTION IS UNTOUCHED. `source` is not modified here, so the scan, the
-- share, the confession, the console's counts and the venue's own wall view all
-- still credit the venue exactly as before. Only the stamp changes.
--
-- Direct traffic is unaffected in practice: source 'direct' resolves to no
-- display name, so those cards already render LOCATION WITHHELD either way.
--
-- ONE-WAY, like every other flag in this function: `and` can only ever remove a
-- stamp, never grant one, and the guard below still fires ONCE per row (session_id
-- is null), so a later call can't revisit the decision. An admin can still restore
-- an individual stamp by hand via admin_set_stamp_venue.
--
-- Same signature as the existing function, so this is a REPLACE: no drop, no
-- re-grant, and every caller keeps working mid-deploy.

create or replace function public.tag_confession(
  _subject_number bigint,
  _session_id     text,
  _is_test        boolean,
  _physical       boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.confessions
     set session_id  = coalesce(session_id, _session_id),
         is_test     = is_test or coalesce(_is_test, false),
         physical    = physical or coalesce(_physical, false),
         -- THE ONE NEW LINE. A remote session cannot stamp the venue.
         stamp_venue = stamp_venue and coalesce(_physical, false)
   where subject_number = _subject_number
     and session_id is null;
end;
$$;

-- Grants are preserved by CREATE OR REPLACE; restated to keep this file
-- self-contained if it is ever replayed onto a fresh database.
revoke all on function public.tag_confession(bigint, text, boolean, boolean) from public, anon;
grant execute on function public.tag_confession(bigint, text, boolean, boolean) to anon;
