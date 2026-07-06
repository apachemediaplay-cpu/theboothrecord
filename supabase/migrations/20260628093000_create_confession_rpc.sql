-- SECURITY DEFINER insert helper so the Edge Function (anon key) can capture the
-- generated subject_number on insert. Anon cannot SELECT a fresh 'pending' row back
-- under RLS, so this function performs the insert and RETURNS the serial.
-- Status is clamped to pending/blocked so anon can never insert an 'approved' row.
create or replace function public.create_confession(
  p_confession text,
  p_verdict text,
  p_source text,
  p_status text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_subject bigint;
begin
  v_status := case when p_status in ('pending', 'blocked') then p_status else 'pending' end;
  insert into public.confessions (confession_text, verdict_text, source, status)
  values (
    p_confession,
    p_verdict,
    coalesce(nullif(btrim(p_source), ''), 'direct'),
    v_status
  )
  returning subject_number into v_subject;
  return v_subject;
end;
$$;

revoke all on function public.create_confession(text, text, text, text) from public;
grant execute on function public.create_confession(text, text, text, text) to anon;
