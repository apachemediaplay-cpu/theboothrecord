-- Console-editable prompt-mode map: which pinned prompt version answers each
-- confession mode. Replaces the hardcoded PROMPT_BY_MODE map inside the
-- generate-verdict edge function with a table read (60s cache there).
-- Modeled on site_copy, which does the same job for the DTC greeting.
--
-- RULE CHANGE, deliberate (also recorded beside the edge function's read):
-- the settled rule was that the version pin lives as a string literal in the
-- callPrompt call and is the single source of truth for what's live. THIS
-- TABLE is now the source of truth; the literal in the function is a FLOOR —
-- used only when this table is unreachable, empty, or slow.
--
-- General routing layer, NOT round code: venue prompts, experiments,
-- seasonal variants all use it. The (shelved) round was to be the first
-- caller, not the reason.

-- 1. Table + seed. ---------------------------------------------------------------
create table if not exists public.prompt_modes (
  mode       text primary key,
  version    text not null,
  updated_at timestamptz not null default now()
);

alter table public.prompt_modes enable row level security;

-- NOT anon-readable — unlike site_copy, nothing on the public site needs
-- this. The edge function reads it with the SERVICE ROLE (bypasses RLS).
-- The console reads it as an authenticated admin via this policy (the brief
-- specified no anon read; the console still needs one — this is the read
-- path for it, gated exactly like the admin_* RPCs):
create policy "admins read prompt_modes"
  on public.prompt_modes for select
  to authenticated
  using (public.is_admin());

-- VERSION FORMAT: the bare OpenAI prompt version number ("52"), NOT "v52" —
-- callPrompt passes this string straight to the Responses API, which rejects
-- a v-prefix. (The edge function normalises a stray leading "v" from console
-- entries, but the stored value should be the real format.)
insert into public.prompt_modes (mode, version)
values ('solo', '52'), ('round', '52')
on conflict (mode) do nothing;

-- 2. Admin write path — same shape as admin_set_site_copy: is_admin() gate,
-- trim, blank version rejected. UPDATE-ONLY: unknown mode raises rather than
-- upserting (admin_add_prompt_mode below is the deliberate create path).
create or replace function public.admin_set_prompt_mode(_mode text, _version text)
returns public.prompt_modes
language plpgsql
security definer
set search_path = public
as $$
declare
  _m   text := lower(trim(coalesce(_mode, '')));
  _v   text := trim(coalesce(_version, ''));
  _row public.prompt_modes;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _v = '' then
    raise exception 'version is required';
  end if;
  if char_length(_v) > 40 then
    raise exception 'version too long (max 40 chars)';
  end if;
  update public.prompt_modes
     set version    = _v,
         updated_at = now()
   where mode = _m
  returning * into _row;
  if _row.mode is null then
    raise exception 'unknown mode: %', coalesce(nullif(_m, ''), '(blank)');
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_set_prompt_mode(text, text) from public, anon;
grant execute on function public.admin_set_prompt_mode(text, text) to authenticated;

-- 3. admin_add_prompt_mode — a new mode from the console without a migration.
-- Rejects an existing mode (use admin_set_prompt_mode to change a version).
-- Mode shape kept to slug characters so the edge function's body matching and
-- the console list stay clean.
create or replace function public.admin_add_prompt_mode(_mode text, _version text)
returns public.prompt_modes
language plpgsql
security definer
set search_path = public
as $$
declare
  _m   text := lower(trim(coalesce(_mode, '')));
  _v   text := trim(coalesce(_version, ''));
  _row public.prompt_modes;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _m = '' then
    raise exception 'mode is required';
  end if;
  if _m !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'mode must be 1-40 chars of a-z 0-9 _ -';
  end if;
  if _v = '' then
    raise exception 'version is required';
  end if;
  if char_length(_v) > 40 then
    raise exception 'version too long (max 40 chars)';
  end if;
  if exists (select 1 from public.prompt_modes where mode = _m) then
    raise exception 'mode already exists: %', _m;
  end if;
  insert into public.prompt_modes (mode, version)
  values (_m, _v)
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_add_prompt_mode(text, text) from public, anon;
grant execute on function public.admin_add_prompt_mode(text, text) to authenticated;
