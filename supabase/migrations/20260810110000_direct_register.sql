-- Direct's placeholder register: the Channels panel's PLACEHOLDERS dropdown
-- for the Direct channel, stored beside its greeting and verdict prompt in
-- site_copy. Null means the DTC fallback set — unchanged behaviour until the
-- dropdown is first used, because the coalesce below lands on 'dtc' exactly
-- as it always has.
--
-- This makes the control REAL, not preview decoration: the register stored
-- here drives the live /confess placeholder set for all no-source traffic
-- (Instagram, shared cards, typed URLs) through the same register/lines
-- fields the client already reads — no client change needed for the routing.
--
-- DEPENDS ON 20260810100000_direct_prompt_mode.sql (site_copy.prompt_mode +
-- the get_confess_config this regrow supersedes). Guard fails loudly on a
-- wrong paste order.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_copy' and column_name = 'prompt_mode'
  ) then
    raise exception 'paste 20260810100000_direct_prompt_mode.sql first';
  end if;
end $$;

-- 1. The column. Null = DTC fallback, same convention as venues.register.
alter table public.site_copy
  add column if not exists register text default null;

-- 2. The setter — the venue register setter's exact validation (the same
--    whitelist), scoped to the default_prompt row.
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
     and _register not in ('social', 'intimate', 'edgy', 'greed', 'vanity', 'appetite') then
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

-- 3. get_confess_config regrown: register and lines now coalesce
--    venue → site_copy (Direct's choice) → 'dtc'. FULL final signature —
--    supersedes the regrow in 20260810100000; pasting this last always
--    yields the correct final state. Additive/attitude-safe for deployed
--    clients as ever: named-field reads, same fields, richer resolution.
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
  ),
  sc as (
    select value_headline, value_guidance, prompt_mode, register
    from public.site_copy
    where key = 'default_prompt'
  )
  select
    (select v.headline from v),
    (select v.guidance from v),
    coalesce((select v.register from v), (select sc.register from sc), 'dtc'),
    (select r.lines from public.registers r
      where r.register = coalesce((select v.register from v), (select sc.register from sc), 'dtc')),
    (select sc.value_headline from sc),
    (select sc.value_guidance from sc),
    (select v.prompt_mode from v),
    (select sc.prompt_mode from sc);
$$;

grant execute on function public.get_confess_config(text) to anon, authenticated;
