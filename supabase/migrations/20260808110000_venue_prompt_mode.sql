-- Per-venue prompt routing: venues.prompt_mode names a prompt_modes row; the
-- confession submitted from that venue carries it as the mode, so the verdict
-- comes from that mode's pinned prompt version.
--
-- NULL means "use the default mode" and the column deliberately has NO
-- default value: null (fallback) and an explicit 'default' (deliberate
-- choice) must stay distinguishable so the console can show which one it is.
--
-- Editable via its OWN setter, admin_set_venue_prompt_mode — NOT by widening
-- admin_set_venue_register: that setter has a stable 2-argument signature the
-- deployed console calls at two sites (widening risks overload ambiguity
-- mid-deploy), and the venue panel's pattern is one setting, one RPC
-- (register / active / greeting each have their own).

-- 1. The column.
alter table public.venues
  add column if not exists prompt_mode text default null;

-- 2. The setter. Server re-validates what the console dropdown feeds it:
--    null / blank clears to the fallback; a non-null mode must exist in
--    prompt_modes (a typo'd mode would otherwise fall back to default
--    SILENTLY at verdict time, with nothing to say why).
create or replace function public.admin_set_venue_prompt_mode(_source text, _prompt_mode text)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  _pm  text := lower(trim(coalesce(_prompt_mode, '')));
  _row public.venues;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _pm = '' then
    update public.venues set prompt_mode = null where source = _source
    returning * into _row;
  else
    if not exists (select 1 from public.prompt_modes where mode = _pm) then
      raise exception 'unknown prompt mode: %', _pm;
    end if;
    update public.venues set prompt_mode = _pm where source = _source
    returning * into _row;
  end if;
  if _row.source is null then
    raise exception 'unknown venue: %', coalesce(_source, '(null)');
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_venue_prompt_mode(text, text) from public, anon;
grant execute on function public.admin_set_venue_prompt_mode(text, text) to authenticated;

-- 3. Display-name setter — the identity fields were never editable
--    post-create (no RPC existed); the panel redesign moves identity to the
--    row header with a rename affordance, and this is its write path. The
--    SLUG stays permanent by design: it's printed on QR cards and is the
--    attribution key on every historical row.
create or replace function public.admin_set_venue_display_name(_source text, _display_name text)
returns public.venues
language plpgsql
security definer
set search_path = public
as $$
declare
  _name text := trim(coalesce(_display_name, ''));
  _row  public.venues;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _name = '' then
    raise exception 'display name is required';
  end if;
  if char_length(_name) > 80 then
    raise exception 'display name too long (max 80 chars)';
  end if;
  update public.venues set display_name = _name where source = _source
  returning * into _row;
  if _row.source is null then
    raise exception 'unknown venue: %', coalesce(_source, '(null)');
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_venue_display_name(text, text) from public, anon;
grant execute on function public.admin_set_venue_display_name(text, text) to authenticated;

-- 4. get_confess_config gains prompt_mode. RETURN-TYPE CHANGE → DROP + CREATE
--    (the exact precedent of 20260801060000, which added the two default_*
--    columns the same way). ADDITIVE-SAFE for callers: the client reads named
--    fields from the row and ignores extras, so deployed clients keep working
--    through and after this paste; the paste is one transaction, so there is
--    no window with no function. Grants restated identically.
drop function if exists public.get_confess_config(text);

create or replace function public.get_confess_config(_source text)
returns table (
  headline         text,
  guidance         text,
  register         text,
  lines            text[],
  default_headline text,
  default_guidance text,
  prompt_mode      text
)
language sql
stable
set search_path = public
as $$
  with v as (
    select venues.headline, venues.guidance, venues.register, venues.prompt_mode
    from public.venues
    where venues.source = lower(trim(coalesce(_source, '')))
  )
  select
    (select v.headline from v),
    (select v.guidance from v),
    coalesce((select v.register from v), 'dtc'),
    (select r.lines from public.registers r
      where r.register = coalesce((select v.register from v), 'dtc')),
    (select sc.value_headline from public.site_copy sc where sc.key = 'default_prompt'),
    (select sc.value_guidance from public.site_copy sc where sc.key = 'default_prompt'),
    (select v.prompt_mode from v);
$$;

grant execute on function public.get_confess_config(text) to anon, authenticated;
