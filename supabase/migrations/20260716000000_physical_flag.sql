-- Physical-scan flag: separate an in-room card scan (?venue= present) from remote
-- share-through / IG traffic that carries the same source. Data layer only. Does NOT
-- touch generate-verdict, verdict prompt (v45), gatekeeper (v14), create_confession,
-- stamp_venue, topic classifier, RLS, or moderation.

alter table public.scan_events
  add column if not exists physical boolean not null default false;

alter table public.confessions
  add column if not exists physical boolean not null default false;

drop function if exists public.log_scan(text, text, boolean);

create or replace function public.log_scan(
  _source     text,
  _session_id text,
  _is_test    boolean default false,
  _physical   boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.scan_events (source, session_id, is_test, physical)
  values (
    coalesce(nullif(btrim(_source), ''), 'direct'),
    nullif(btrim(_session_id), ''),
    coalesce(_is_test, false),
    coalesce(_physical, false)
  );
end;
$$;

revoke all on function public.log_scan(text, text, boolean, boolean) from public, anon;
grant execute on function public.log_scan(text, text, boolean, boolean) to anon;

drop function if exists public.tag_confession(bigint, text, boolean);

create or replace function public.tag_confession(
  _subject_number bigint,
  _session_id     text,
  _is_test        boolean,
  _physical       boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.confessions
     set session_id = coalesce(session_id, _session_id),
         is_test    = is_test or coalesce(_is_test, false),
         physical   = physical or coalesce(_physical, false)
   where subject_number = _subject_number
     and session_id is null;
end;
$$;

revoke all on function public.tag_confession(bigint, text, boolean, boolean) from public, anon;
grant execute on function public.tag_confession(bigint, text, boolean, boolean) to anon;
