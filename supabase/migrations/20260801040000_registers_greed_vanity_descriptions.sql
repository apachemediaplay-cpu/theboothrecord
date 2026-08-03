-- Two new placeholder registers (greed, vanity) + descriptions for all six.
-- Registers are shared: Frenchie and Gigi need distinct sets without overwriting
-- the existing four. Descriptions are DB-owned copy (surfaced in the console's
-- register dropdown / sets list) — refining them must never need a deploy.
--
-- Touches, in order:
--   1. registers + venues CHECK constraints widened to the six keys.
--   2. registers.description column (text, nullable).
--   3. The three key-validating RPCs recreated with the six keys — otherwise the
--      console cannot save the new sets or assign them to venues.
--   4. Seed greed + vanity (lines + description); descriptions for the four
--      existing sets (their LINES are untouched).
--   5. frenchiecbd → greed, gigiprahran → vanity.

-- 1. Widen the key constraints. ------------------------------------------------
alter table public.registers drop constraint if exists registers_register_check;
alter table public.registers add constraint registers_register_check
  check (register in ('dtc', 'social', 'intimate', 'edgy', 'greed', 'vanity'));

alter table public.venues drop constraint if exists venues_register_check;
alter table public.venues add constraint venues_register_check
  check (register in ('social', 'intimate', 'edgy', 'greed', 'vanity'));

-- 2. Description column. -------------------------------------------------------
alter table public.registers add column if not exists description text;

-- 3a. admin_set_register_lines — same body as 20260731100000, six keys. --------
create or replace function public.admin_set_register_lines(_register text, _lines text[])
returns public.registers
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean text[];
  _line  text;
  _row   public.registers;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _register not in ('dtc', 'social', 'intimate', 'edgy', 'greed', 'vanity') then
    raise exception 'invalid register: %', coalesce(_register, '(null)');
  end if;
  if _lines is null or cardinality(_lines) < 1 or cardinality(_lines) > 12 then
    raise exception 'need between 1 and 12 lines';
  end if;
  _clean := array[]::text[];
  foreach _line in array _lines loop
    _line := trim(_line);
    if _line = '' then
      raise exception 'blank line not allowed';
    end if;
    if char_length(_line) > 80 then
      raise exception 'line too long (max 80 chars): %', _line;
    end if;
    _clean := _clean || _line;
  end loop;
  update public.registers set lines = _clean where register = _register
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_set_register_lines(text, text[]) from public, anon;
grant execute on function public.admin_set_register_lines(text, text[]) to authenticated;

-- 3b. admin_set_venue_register — same body as 20260730100000, six keys. --------
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
  if _register is not null
     and _register not in ('social', 'intimate', 'edgy', 'greed', 'vanity') then
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

-- 3c. admin_add_venue — same body as 20260730140000, six keys. -----------------
create or replace function public.admin_add_venue(
  _source text,
  _display_name text,
  _register text default null,
  _headline text default null,
  _guidance text default null,
  _active boolean default true
)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  _slug text := lower(trim(_source));
  _name text := trim(_display_name);
  _row public.venues;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _slug is null or char_length(_slug) < 3 or char_length(_slug) > 40
     or _slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
    raise exception 'invalid slug: %', coalesce(_slug, '(null)');
  end if;
  if _name is null or _name = '' then
    raise exception 'display name is required';
  end if;
  if _register is not null
     and _register not in ('social', 'intimate', 'edgy', 'greed', 'vanity') then
    raise exception 'invalid register: %', _register;
  end if;
  if exists (select 1 from public.venues where source = _slug) then
    raise exception 'slug already exists: %', _slug;
  end if;
  insert into public.venues (source, display_name, register, headline, guidance, active)
  values (
    _slug,
    _name,
    _register,
    nullif(trim(_headline), ''),
    nullif(trim(_guidance), ''),
    coalesce(_active, true)
  )
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_add_venue(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_add_venue(text, text, text, text, text, boolean) to authenticated;

-- 4. Seed the new sets; describe all six. Existing sets' LINES untouched. ------
insert into public.registers (register, lines, description) values
  ('greed', array[
    'had the caviar three times',
    'ordered for the table then ate most of it',
    'checked myself in the mirror on the way down',
    'waited for the trolley to come back round',
    'said id split it then didnt',
    'came for one drink at nine'
  ], 'Ordering, taking, staying. Loud, late, food-led rooms.'),
  ('vanity', array[
    'changed twice before leaving the house',
    'took the photo before the drink arrived',
    'dressed for someone who isnt coming',
    'know exactly which chair i want',
    'spent more getting ready than on the bottle',
    'was ready an hour before we left'
  ], 'Getting ready, being seen, the photo. Dress-up rooms.')
on conflict (register) do nothing;

update public.registers set description = 'Default. No venue, or a room you haven''t judged yet.' where register = 'dtc';
update public.registers set description = 'Groups, hosting, who you''re with. Shared tables.'      where register = 'social';
update public.registers set description = 'Two people, small indulgences. Wine bars, dinner.'      where register = 'intimate';
update public.registers set description = 'Nights that go sideways. Late bars, hotels.'            where register = 'edgy';

-- 5. Assign the new registers. -------------------------------------------------
update public.venues set register = 'greed'  where source = 'frenchiecbd';
update public.venues set register = 'vanity' where source = 'gigiprahran';
