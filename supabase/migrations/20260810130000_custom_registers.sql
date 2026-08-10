-- Custom registers: registers become console-creatable rows instead of a
-- hardcoded key list. Adding one has meant widening two CHECK constraints and
-- four RPC whitelists and deploying — so a venue's placeholder lines couldn't
-- be tuned during a pitch. After this, the console creates a register (name,
-- description, six lines) and every register picker offers it immediately.
--
-- Registers stay room types, not venue property: any venue may point at any
-- register, including a custom one. A register named after the venue that
-- prompted it (a "frenchie") is still shared vocabulary — nothing here scopes
-- a register to a venue, deliberately.
--
-- FAIL-SAFE CONTRACT (unchanged, recorded because custom registers stress it):
-- the hardcoded sets in src/lib/registers.ts remain the floor. A custom
-- register has no hardcoded twin — if its row were ever missing while the
-- venue still pointed at it, that venue's /confess would fall back to DTC.
-- The delete guard below plus the foreign keys make that state unreachable:
-- a register in use cannot be deleted, by RPC or by hand.
--
-- DEPENDS ON 20260810110000_direct_register.sql (site_copy.register +
-- admin_set_direct_register, both regrown here). Guard fails loudly on a
-- wrong paste order.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_copy' and column_name = 'register'
  ) then
    raise exception 'paste 20260810110000_direct_register.sql first';
  end if;
end $$;

-- 1. Key constraints: whitelist → shape. ---------------------------------------
-- The name is a key: lowercase letters and digits only, starts with a letter,
-- 2–40 chars. All seven existing keys pass. 'default' is additionally reserved
-- in admin_create_register below — the console pickers use it as the UI
-- stand-in for null, so a real register by that name would be unselectable.

alter table public.registers drop constraint if exists registers_register_check;
alter table public.registers add constraint registers_register_check
  check (register ~ '^[a-z][a-z0-9]{1,39}$');

-- venues.register / site_copy.register: the whitelist becomes a foreign key,
-- which is both the "must exist" rule and the DB-level delete guard
-- (references block the delete even if someone bypasses the RPC in the
-- dashboard). 'dtc' stays excluded as a stored value — null means dtc, the
-- convention every read path already implements.

alter table public.venues drop constraint if exists venues_register_check;
alter table public.venues add constraint venues_register_check
  check (register is null or register <> 'dtc');
alter table public.venues drop constraint if exists venues_register_fkey;
alter table public.venues add constraint venues_register_fkey
  foreign key (register) references public.registers(register);

alter table public.site_copy drop constraint if exists site_copy_register_check;
alter table public.site_copy add constraint site_copy_register_check
  check (register is null or register <> 'dtc');
alter table public.site_copy drop constraint if exists site_copy_register_fkey;
alter table public.site_copy add constraint site_copy_register_fkey
  foreign key (register) references public.registers(register);

-- 2. admin_create_register. ----------------------------------------------------
-- Exactly six lines (the console rule — rotation pacing must not drift between
-- sets; admin_set_register_lines' looser 1–12 stays as-is for edits because
-- tightening it would change behaviour under the deployed console). The
-- description is required: it renders under the register in every picker, and
-- it's the only way anyone later knows what room a custom register was for.

create or replace function public.admin_create_register(
  _register text,
  _description text,
  _lines text[]
)
returns public.registers
language plpgsql
security definer
set search_path = public
as $$
declare
  _key   text := lower(trim(_register));
  _desc  text := trim(_description);
  _clean text[];
  _line  text;
  _row   public.registers;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _key is null or _key !~ '^[a-z][a-z0-9]{1,39}$' then
    raise exception 'invalid name (lowercase letters and numbers only, 2-40 chars): %',
      coalesce(_key, '(null)');
  end if;
  if _key = 'default' then
    raise exception 'name ''default'' is reserved (it stands for null in the pickers)';
  end if;
  if exists (select 1 from public.registers where register = _key) then
    raise exception 'register already exists: %', _key;
  end if;
  if _desc is null or _desc = '' then
    raise exception 'description is required';
  end if;
  if _lines is null or cardinality(_lines) <> 6 then
    raise exception 'exactly six lines required';
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
  insert into public.registers (register, lines, description)
  values (_key, _clean, _desc)
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_create_register(text, text, text[]) from public, anon;
grant execute on function public.admin_create_register(text, text, text[]) to authenticated;

-- 3. admin_delete_register. ----------------------------------------------------
-- Two guards, both required:
--   * The seven built-ins can NEVER be deleted, in use or not — they are the
--     fail-safe set with hardcoded twins in src/lib/registers.ts, referenced
--     in code. This list is deliberately hardcoded here to match.
--   * A register in use by any venue or by Direct (site_copy.register) refuses
--     with the users named — deleting it silently would drop those venues to
--     the DTC fallback with nothing on screen to explain it. The foreign keys
--     above enforce the same rule against dashboard hand-edits.

create or replace function public.admin_delete_register(_register text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _key    text := lower(trim(_register));
  _venues text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _key in ('dtc', 'social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite') then
    raise exception 'built-in register cannot be deleted: %', _key;
  end if;
  if not exists (select 1 from public.registers where register = _key) then
    raise exception 'unknown register: %', coalesce(_key, '(null)');
  end if;
  select string_agg(source, ', ' order by source) into _venues
  from public.venues where register = _key;
  if _venues is not null then
    raise exception 'register % is in use by: %', _key, _venues;
  end if;
  if exists (select 1 from public.site_copy where register = _key) then
    raise exception 'register % is in use by the Direct channel', _key;
  end if;
  delete from public.registers where register = _key;
end;
$$;

revoke all on function public.admin_delete_register(text) from public, anon;
grant execute on function public.admin_delete_register(text) to authenticated;

-- 4. The four whitelist RPCs, regrown: "in the list" → "in the table". --------
-- Full final bodies (supersede 20260801050000 / 20260810110000); behaviour is
-- identical for every existing key. Venue/Direct setters keep excluding 'dtc'
-- as a stored value; existence is re-checked here so the error is a clean
-- message rather than an FK violation.

-- 4a. admin_set_register_lines — any key present in the table.
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
  if not exists (select 1 from public.registers where register = _register) then
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

-- 4b. admin_set_venue_register — null, or any table key except 'dtc'.
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
     and (_register = 'dtc'
          or not exists (select 1 from public.registers where register = _register)) then
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

-- 4c. admin_add_venue — same register rule as 4b.
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
     and (_register = 'dtc'
          or not exists (select 1 from public.registers where register = _register)) then
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

-- 4d. admin_set_direct_register — same register rule as 4b.
create or replace function public.admin_set_direct_register(_register text)
returns public.site_copy
language plpgsql
security definer
set search_path = public
as $$
declare _row public.site_copy;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _register is not null
     and (_register = 'dtc'
          or not exists (select 1 from public.registers where register = _register)) then
    raise exception 'invalid register: %', _register;
  end if;
  update public.site_copy
     set register   = _register,
         updated_at = now()
   where key = 'default_prompt'
  returning * into _row;
  if _row.key is null then
    raise exception 'site_copy default_prompt row missing';
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_direct_register(text) from public, anon;
grant execute on function public.admin_set_direct_register(text) to authenticated;
