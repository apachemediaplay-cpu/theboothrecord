-- Venue greetings + active status: moves the confess-screen greeting (headline +
-- guidance) into public.venues so it can be edited from the console without a deploy,
-- and adds an active flag for the venues overview.
--
-- Scope guard: this touches ONLY the greeting READ path and console writes.
-- display_name stays the share-card path and is NOT written by any function here.
--
-- Security model: identical to admin_set_venue_register (20260730100000):
--   * anon/authenticated READ via the existing "public reads venues" policy —
--     the confess screen resolves source → headline/guidance with the anon key.
--   * writes only via SECURITY DEFINER RPCs gated by is_admin(). No direct
--     insert/update/delete policy exists for any role.

alter table public.venues
  add column if not exists headline text,
  add column if not exists guidance text,
  add column if not exists active   boolean not null default true;

-- Admin-only greeting update (console). null headline clears the venue back to the
-- client's DEFAULT_PROMPT fail-safe ("Confess something."); guidance may be null
-- independently (headline-only greeting, same shape venues.json allowed).
create or replace function public.admin_set_venue_greeting(_source text, _headline text, _guidance text)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare _row public.venues;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.venues
     set headline = nullif(trim(_headline), ''),
         guidance = nullif(trim(_guidance), '')
   where source = _source
  returning * into _row;
  if _row.source is null then
    raise exception 'unknown venue: %', _source;
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_venue_greeting(text, text, text) from public, anon;
grant execute on function public.admin_set_venue_greeting(text, text, text) to authenticated;

-- Admin-only active toggle (console). active is presentation-level only — an
-- inactive venue still resolves greetings/registers if scanned; nothing here
-- gates the confess flow.
create or replace function public.admin_set_venue_active(_source text, _active boolean)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare _row public.venues;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _active is null then
    raise exception 'active must be true or false';
  end if;
  update public.venues set active = _active where source = _source
  returning * into _row;
  if _row.source is null then
    raise exception 'unknown venue: %', _source;
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_venue_active(text, boolean) from public, anon;
grant execute on function public.admin_set_venue_active(text, boolean) to authenticated;

-- Seed greetings from src/data/venues.json (values as of 2026-07-30). active=true for
-- all existing rows comes from the column default above.
update public.venues v
   set headline = s.headline,
       guidance = s.guidance
  from (values
    ('seoultiger1988',   'Confess your most guilty order.',  'The one you''d never admit to.'),
    ('frenchiecbda',     'Everyone here is guilty.',         'Yours first.'),
    ('frenchiecbdb',     'We already know.',                 'Say it anyway.'),
    ('frenchiecbd',      'Everyone here is guilty.',         'Yours first.'),
    ('highballcbr',      'Confess your best worst decision.','Good vibes only.'),
    ('ovolosy',          'If these walls could talk.',       'Confess what the room saw.'),
    ('tintinokgn',       'The wine already told us.',        'Confess it yourself.'),
    ('gigiprahran',      'Gigi is listening.',               'Tell her everything.'),
    ('standardxfitzroy', 'Check in. Check out. Confess.',    'We dare you.')
  ) as s(source, headline, guidance)
 where v.source = s.source;
