-- Direct channel's verdict prompt: the DTC audience gets the same two-part
-- shape as a venue. The choice is STORED as a mode name in site_copy (the
-- row that already holds Direct's greeting) — never as a version number
-- copied into the dtc prompt_modes row, which would duplicate the number
-- and drift (change roast to 57 and dtc silently stays on 56).
--
-- Resolution after this lands: the client's mount-time decision still marks
-- no-source traffic as 'dtc'; when the config arrives, the stored mode name
-- REPLACES it (unset → no mode sent → 'default'). The dtc prompt_modes row
-- survives in the database as the compatibility shim for the fetch-race
-- window and older deployed clients — the edge function's fallback chain is
-- untouched either way.
--
-- DEPENDS ON 20260808110000_venue_prompt_mode.sql (venues.prompt_mode +
-- the get_confess_config regrow this one supersedes). The guard below makes
-- a wrong paste order fail loudly instead of half-applying.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues' and column_name = 'prompt_mode'
  ) then
    raise exception 'paste 20260808110000_venue_prompt_mode.sql first';
  end if;
end $$;

-- 1. The stored choice. Nullable, no default: null means "use the default
--    mode", distinguishable from an explicit choice — same convention as
--    venues.prompt_mode.
alter table public.site_copy
  add column if not exists prompt_mode text default null;

-- 2. The setter — the exact shape of admin_set_venue_prompt_mode: is_admin()
--    gate, null/blank clears, a non-null mode must exist in prompt_modes (a
--    typo'd mode would otherwise fall back to default silently at verdict
--    time). Writes the default_prompt row only.
create or replace function public.admin_set_direct_prompt_mode(_prompt_mode text)
returns public.site_copy
language plpgsql
security definer
set search_path = public
as $$
declare
  _pm  text := lower(trim(coalesce(_prompt_mode, '')));
  _row public.site_copy;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _pm <> '' and not exists (select 1 from public.prompt_modes where mode = _pm) then
    raise exception 'unknown prompt mode: %', _pm;
  end if;
  update public.site_copy
     set prompt_mode = nullif(_pm, ''),
         updated_at  = now()
   where key = 'default_prompt'
  returning * into _row;
  if _row.key is null then
    raise exception 'site_copy default_prompt row missing';
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_direct_prompt_mode(text) from public, anon;
grant execute on function public.admin_set_direct_prompt_mode(text) to authenticated;

-- 3. get_confess_config regrown with direct_prompt_mode appended — the FULL
--    final signature (supersedes the regrow in 20260808110000; pasting this
--    after it always yields the correct final state). Additive-safe for
--    deployed clients exactly as before: named-field reads ignore extras.
drop function if exists public.get_confess_config(text);

create or replace function public.get_confess_config(_source text)
returns table (
  headline           text,
  guidance           text,
  register           text,
  lines              text[],
  default_headline   text,
  default_guidance   text,
  prompt_mode        text,
  direct_prompt_mode text
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
    (select v.prompt_mode from v),
    (select sc.prompt_mode from public.site_copy sc where sc.key = 'default_prompt');
$$;

grant execute on function public.get_confess_config(text) to anon, authenticated;
