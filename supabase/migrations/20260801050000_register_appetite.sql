-- Fifth shared placeholder register: 'appetite', for food-led venues.
-- Same pattern as 20260801040000 (greed/vanity): widen the two CHECK constraints
-- and the three key-whitelisting RPCs, seed the set with its description, then
-- reassign seoultiger1988 — currently 'social', which assumes a bar and a table
-- of drinkers; wrong for a counter-service burger shop.

-- 1. Widen the key constraints. ------------------------------------------------
alter table public.registers drop constraint if exists registers_register_check;
alter table public.registers add constraint registers_register_check
  check (register in ('dtc', 'social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite'));

alter table public.venues drop constraint if exists venues_register_check;
alter table public.venues add constraint venues_register_check
  check (register in ('social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite'));

-- 2a. admin_set_register_lines — same body, seven keys. ------------------------
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
  if _register not in ('dtc', 'social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite') then
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

-- 2b. admin_set_venue_register — same body, six venue keys. --------------------
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
     and _register not in ('social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite') then
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

-- 2c. admin_add_venue — same body, six venue keys. -----------------------------
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
     and _register not in ('social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite') then
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

-- 3. Seed the set. ---------------------------------------------------------------
insert into public.registers (register, lines, description) values
  ('appetite', array[
    'ordered before anyone else decided',
    'had a bite of everyone elses',
    'said next time then came back twice',
    'looked at the menu like i didnt know',
    'kept eating after they stopped',
    'ordered again on the way out'
  ], 'Eating together. Ordering, sharing, going back. Food-led rooms.')
on conflict (register) do nothing;

-- 4. Reassign the burger shop. ---------------------------------------------------
update public.venues set register = 'appetite' where source = 'seoultiger1988';
