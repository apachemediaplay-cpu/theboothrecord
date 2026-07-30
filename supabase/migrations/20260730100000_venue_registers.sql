-- Venue registers: which rotating example set the /confess placeholder shows per venue.
--
-- register drives ONLY the confess-screen placeholder content. null = default/DTC set.
-- The table is keyed by the same source slug as confessions.source / venues.json —
-- venues.json stays the source of truth for display names + prompts; this table adds
-- the one server-driven knob (register) so it can be flipped from the console without
-- a deploy.
--
-- Security model (same as wall_moderation):
--   * anon/authenticated may READ (the confess screen looks up its venue's register
--     with the public client, pre-auth).
--   * writes go through a SECURITY DEFINER RPC that verifies is_admin(). No direct
--     insert/update/delete policy exists for any role.

create table if not exists public.venues (
  source       text primary key,
  display_name text not null,
  register     text check (register in ('social', 'intimate', 'edgy'))
);

alter table public.venues enable row level security;

-- Public read-only: the confess screen resolves source → register on load.
create policy "public reads venues"
  on public.venues for select
  to anon, authenticated
  using (true);

-- Admin-only register update (console dropdown). null clears back to default/DTC.
create or replace function public.admin_set_venue_register(_source text, _register text)
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
  if _register is not null and _register not in ('social', 'intimate', 'edgy') then
    raise exception 'invalid register: %', _register;
  end if;
  update public.venues set register = _register where source = _source
  returning * into _row;
  if _row.source is null then
    raise exception 'unknown venue: %', _source;
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_venue_register(text, text) from public, anon;
grant execute on function public.admin_set_venue_register(text, text) to authenticated;

-- Seed: the current venues.json venue list. register null everywhere = DTC set.
insert into public.venues (source, display_name, register) values
  ('seoultiger1988',   'Seoul Tiger 1988',         null),
  ('frenchiecbda',     'Frenchie',                 null),
  ('frenchiecbdb',     'Frenchie',                 null),
  ('frenchiecbd',      'Frenchie',                 null),
  ('highballcbr',      'Highball',                 null),
  ('ovolosy',          'Ovolo South Yarra',        null),
  ('tintinokgn',       'Tintino',                  null),
  ('gigiprahran',      'Gigi',                     null),
  ('standardxfitzroy', 'The StandardX, Melbourne', null)
on conflict (source) do nothing;
