-- Scan tracking + completion/share-rate reads for the /moderate Metrics panel.
-- Data layer only. Does NOT touch generate-verdict, the verdict prompt, the gatekeeper,
-- create_confession, stamp_venue, the topic classifier, confessions RLS, or moderation
-- write paths. Mirrors the booth_metrics migration (share_events / log_share) exactly.
--
-- Run in the Supabase SQL editor; this file is repo parity/history, matching how the
-- other migrations here are managed.

-- 1. Arrivals table: one row per Booth landing ("scan"). ----------------------
create table if not exists public.scan_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source     text not null default 'direct',
  session_id text,
  is_test    boolean not null default false
);

-- RLS on, NO policies: anon can neither read nor write directly. Inserts happen ONLY
-- through log_scan() (SECURITY DEFINER → runs as owner, bypasses RLS). Same shape as
-- share_events.
alter table public.scan_events enable row level security;

-- 2. Anon-callable insert (arrivals are anonymous), mirroring log_share. -------
create or replace function public.log_scan(
  _source     text,
  _session_id text,
  _is_test    boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scan_events (source, session_id, is_test)
  values (
    coalesce(nullif(btrim(_source), ''), 'direct'),
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false)
  );
end;
$$;

revoke all on function public.log_scan(text, text, boolean) from public, anon;
grant execute on function public.log_scan(text, text, boolean) to anon;

-- 3. Admin-only aggregate reads for the Metrics panel. -------------------------
-- SECURITY DEFINER + is_admin() gate, exactly like admin_list_confessions. Never anon.

-- Scans per source, excluding test scans.
create or replace function public.admin_scan_counts()
returns table (source text, scans bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select coalesce(nullif(btrim(s.source), ''), 'direct'), count(*)::bigint
    from public.scan_events s
    where s.is_test = false
    group by 1;
end;
$$;

revoke all on function public.admin_scan_counts() from public, anon;
grant execute on function public.admin_scan_counts() to authenticated;

-- Share taps per source, excluding taps from test sessions. share_events has no is_test
-- column, so a session counts as "test" iff it produced a confession flagged is_test.
create or replace function public.admin_share_counts()
returns table (source text, shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select coalesce(nullif(btrim(e.source), ''), 'direct'), count(*)::bigint
    from public.share_events e
    where e.session_id is null
       or e.session_id not in (
            select c.session_id
            from public.confessions c
            where c.is_test = true and c.session_id is not null
          )
    group by 1;
end;
$$;

revoke all on function public.admin_share_counts() from public, anon;
grant execute on function public.admin_share_counts() to authenticated;
