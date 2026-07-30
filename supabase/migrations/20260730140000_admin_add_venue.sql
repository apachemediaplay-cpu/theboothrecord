-- Add-venue RPC: onboard a new venue entirely from the console — no SQL, no deploy.
--
-- Security model: identical to admin_set_venue_register / admin_set_venue_greeting —
-- SECURITY DEFINER gated by is_admin(); no direct insert policy exists for any role,
-- so this RPC is the ONLY write path into public.venues for new rows.
--
-- Slug rules (enforced here AND client-side — the slug is permanent once a QR is
-- printed): lowercase letters/digits/hyphens, no leading/trailing hyphen, 3–40 chars,
-- matching the existing slug shape (seoultiger1988, frenchiecbda). Duplicates are
-- rejected outright — an existing venue can never be overwritten from this path.

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
  if _register is not null and _register not in ('social', 'intimate', 'edgy') then
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
