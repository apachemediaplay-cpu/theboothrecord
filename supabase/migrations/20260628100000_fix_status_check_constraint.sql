-- The confessions.status CHECK constraint didn't allow 'blocked', so create_confession
-- (SECURITY DEFINER bypasses RLS, but NOT check constraints) failed with 23514 on the
-- block path. Drop any existing CHECK on the status column (whatever its name), then
-- recreate it allowing the full set of statuses the app uses.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'confessions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.confessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.confessions
  add constraint confessions_status_check
  check (status in ('pending', 'approved', 'rejected', 'blocked'));
