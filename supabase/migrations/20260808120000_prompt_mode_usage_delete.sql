-- Prompt-mode delete (guarded from birth — no unguarded delete ever existed)
-- and the usage-count read behind the console's per-mode "N venues · N
-- confessions" line.

-- 1. Delete, with the guard built in. Same refusal shape as
--    admin_delete_venue (raise naming the blockers, never silent):
--    * 'default' can NEVER be deleted — it is the fallback the whole system
--      rests on, and the edge function's hardcoded floor assumes the row
--      exists for its table-read path.
--    * A mode any venue points at refuses, naming the venues — deleting it
--      would leave those venues pointing at nothing, silently falling back
--      to default with nothing to say why.
--    Historical confessions.mode stamps do NOT block deletion: rows record
--    which prompt answered them at the time; that history stays valid after
--    the mode retires.
create or replace function public.admin_delete_prompt_mode(_mode text)
returns public.prompt_modes
language plpgsql
security definer
set search_path = public
as $$
declare
  _m      text := lower(trim(coalesce(_mode, '')));
  _users  text;
  _row    public.prompt_modes;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _m = 'default' then
    raise exception 'the default mode cannot be deleted — it is the system fallback';
  end if;
  select string_agg(source, ', ' order by source) into _users
    from public.venues
   where prompt_mode = _m;
  if _users is not null then
    raise exception 'mode is used by %, clear those venues first', _users;
  end if;
  delete from public.prompt_modes where mode = _m
  returning * into _row;
  if _row.mode is null then
    raise exception 'unknown mode: %', coalesce(nullif(_m, ''), '(blank)');
  end if;
  return _row;
end;
$$;

revoke all on function public.admin_delete_prompt_mode(text) from public, anon;
grant execute on function public.admin_delete_prompt_mode(text) to authenticated;

-- 2. Confession counts by mode, for the usage line. Raw per-mode counts —
--    the client folds the backfilled 'solo' stamp into the default row's
--    display (see the console comment). Test rows excluded, matching every
--    other console count. Venue counts need no RPC at all: the console
--    already holds venuesRows and derives them client-side.
create or replace function public.admin_prompt_mode_usage()
returns table (mode text, confessions bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select c.mode, count(*)::bigint
    from public.confessions c
    where coalesce(c.is_test, false) = false
    group by c.mode;
end;
$$;

revoke all on function public.admin_prompt_mode_usage() from public, anon;
grant execute on function public.admin_prompt_mode_usage() to authenticated;
