-- Editable default (DTC) greeting: the copy ALL Instagram / shared-card / direct
-- traffic sees on /confess, moved from a hardcoded client constant into the DB so
-- iterating on it never needs a deploy.
--
-- Deliberately NOT a fake venue row (settled 1 Aug: 'dtc' lives in registers,
-- never venues — a fake venue would pollute the console list, filters, stats and
-- reports, mint a QR, and be deletable). And deliberately named site_copy, not
-- settings: this table MUST be anon-readable, and a "settings" table invites
-- future rows that shouldn't be.
--
-- The client keeps its hardcoded DEFAULT_PROMPT as the last-resort fail-safe.
-- Chain: venue greeting → site_copy default_prompt → hardcoded constant, with
-- headline+guidance always travelling together per level.

-- 1. Table + seed. ---------------------------------------------------------------
create table if not exists public.site_copy (
  key            text primary key,
  value_headline text,
  value_guidance text,
  updated_at     timestamptz not null default now()
);

alter table public.site_copy enable row level security;

-- Public read-only: the confess screen resolves the default greeting pre-auth.
create policy "public reads site_copy"
  on public.site_copy for select
  to anon, authenticated
  using (true);

insert into public.site_copy (key, value_headline, value_guidance)
values ('default_prompt', 'No one is innocent.', 'Confess.')
on conflict (key) do nothing;

-- 2. Admin write path — same shape as admin_set_register_lines: is_admin() gate,
-- key whitelist (update-only), trim, blank headline rejected, 80-char cap each.
create or replace function public.admin_set_site_copy(_key text, _headline text, _guidance text)
returns public.site_copy
language plpgsql
security definer
set search_path = public
as $$
declare
  _h   text := trim(coalesce(_headline, ''));
  _g   text := trim(coalesce(_guidance, ''));
  _row public.site_copy;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _key not in ('default_prompt') then
    raise exception 'invalid site_copy key: %', coalesce(_key, '(null)');
  end if;
  if _h = '' then
    raise exception 'headline is required';
  end if;
  if char_length(_h) > 80 then
    raise exception 'headline too long (max 80 chars)';
  end if;
  if char_length(_g) > 80 then
    raise exception 'guidance too long (max 80 chars)';
  end if;
  update public.site_copy
     set value_headline = _h,
         value_guidance = nullif(_g, ''),
         updated_at     = now()
   where key = _key
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_set_site_copy(text, text, text) from public, anon;
grant execute on function public.admin_set_site_copy(text, text, text) to authenticated;

-- 3. get_confess_config: SAME single statement + two appended site_copy scalar
-- subselects (still one round-trip; non-venue visitors pay for one call).
-- Return-type change requires DROP + CREATE; grants restated identically.
drop function if exists public.get_confess_config(text);

create or replace function public.get_confess_config(_source text)
returns table (
  headline         text,
  guidance         text,
  register         text,
  lines            text[],
  default_headline text,
  default_guidance text
)
language sql
stable
set search_path = public
as $$
  with v as (
    select venues.headline, venues.guidance, venues.register
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
    (select sc.value_guidance from public.site_copy sc where sc.key = 'default_prompt');
$$;

grant execute on function public.get_confess_config(text) to anon, authenticated;
