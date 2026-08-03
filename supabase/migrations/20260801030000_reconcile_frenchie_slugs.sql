-- Reconcile the Frenchie slugs: frenchiecbd becomes the ONLY Frenchie venue.
-- No cards are in circulation for the deleted slugs. Anon-side verification found
-- zero approved confessions for all three slugs, but pending/blocked rows and
-- scan_events are not anon-readable — so the AUTHORITATIVE zero-check runs here,
-- in the same transaction, and the whole migration aborts if it fails.
--
--   * frenchiecbd keeps its row; greeting set to the better line
--     (headline "We already know.", guidance "Say it anyway." — was frenchiecbdb's).
--   * frenchiecbda and frenchiecbdb are deleted from public.venues.
--   * src/data/venues.json is trimmed to match in the same commit.

do $$
declare
  _confessions bigint;
  _scans bigint;
begin
  select count(*) into _confessions
    from public.confessions where source in ('frenchiecbda', 'frenchiecbdb');
  select count(*) into _scans
    from public.scan_events where source in ('frenchiecbda', 'frenchiecbdb');

  if _confessions > 0 or _scans > 0 then
    raise exception
      'ABORT — frenchiecbda/frenchiecbdb are not empty (confessions=%, scan_events=%); nothing changed',
      _confessions, _scans;
  end if;

  update public.venues
     set headline = 'We already know.',
         guidance = 'Say it anyway.'
   where source = 'frenchiecbd';

  delete from public.venues
   where source in ('frenchiecbda', 'frenchiecbdb');
end;
$$;
