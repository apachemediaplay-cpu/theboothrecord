-- Editable register sets: moves the four /confess placeholder sets (dtc, social,
-- intimate, edgy) into the database so their CONTENT can be edited from the console
-- without a deploy. Until now only the per-venue register ASSIGNMENT was editable
-- (venues.register); the lines themselves were hardcoded in src/lib/registers.ts.
--
-- The hardcoded arrays in registers.ts STAY, as the fail-safe: the client falls back
-- to them silently whenever this table is unreachable, empty, or missing a set.
-- Never an error, never an empty placeholder.
--
-- 'dtc' is a register KEY here but never a venues.register value — venues.register
-- stays null for default venues, and null resolves to 'dtc' at read time.
--
-- Security model: identical to venue_registers (20260730100000):
--   * anon/authenticated may READ (the confess screen loads pre-auth).
--   * writes only via a SECURITY DEFINER RPC gated by is_admin(). No direct
--     insert/update/delete policy exists for any role.

create table if not exists public.registers (
  register text primary key check (register in ('dtc', 'social', 'intimate', 'edgy')),
  lines    text[] not null check (cardinality(lines) >= 1)
);

alter table public.registers enable row level security;

-- Public read-only: the confess screen resolves its placeholder set on load.
create policy "public reads registers"
  on public.registers for select
  to anon, authenticated
  using (true);

-- Admin-only content update (console editor). Update-only: the four keys are the
-- universe — there is no insert path, so a set can never be deleted or added here.
-- Each line is trimmed; blank lines are rejected rather than silently dropped so the
-- console can surface exactly what was wrong.
create or replace function public.admin_set_register_lines(_register text, _lines text[])
returns public.registers
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean text[];
  _line  text;
  _row   public.registers;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if _register not in ('dtc', 'social', 'intimate', 'edgy') then
    raise exception 'invalid register: %', coalesce(_register, '(null)');
  end if;
  if _lines is null or cardinality(_lines) < 1 or cardinality(_lines) > 12 then
    raise exception 'need between 1 and 12 lines';
  end if;
  _clean := array[]::text[];
  foreach _line in array _lines loop
    _line := trim(_line);
    if _line = '' then
      raise exception 'blank line not allowed';
    end if;
    if char_length(_line) > 80 then
      raise exception 'line too long (max 80 chars): %', _line;
    end if;
    _clean := _clean || _line;
  end loop;
  update public.registers set lines = _clean where register = _register
  returning * into _row;
  return _row;
end;
$$;

revoke all on function public.admin_set_register_lines(text, text[]) from public, anon;
grant execute on function public.admin_set_register_lines(text, text[]) to authenticated;

-- Single confess-screen read: source → greeting + register + that register's lines,
-- one round-trip. Always returns exactly one row.
--   * unknown/absent source → null headline/guidance, register 'dtc', dtc lines.
--   * venues.register null → 'dtc' (same null-means-default rule as the client).
--   * missing registers row → lines null → the client falls back to its hardcoded set.
-- NOTE: deliberately does NOT filter on venues.active — the greeting read path never
-- has (fetchVenueConfig selects by source only); active gates name-stamping, not the
-- confess prompt. Both tables are public-read, so this is SECURITY INVOKER.
create or replace function public.get_confess_config(_source text)
returns table (headline text, guidance text, register text, lines text[])
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
      where r.register = coalesce((select v.register from v), 'dtc'));
$$;

grant execute on function public.get_confess_config(text) to anon, authenticated;

-- Seed: the four sets exactly as currently hardcoded in src/lib/registers.ts.
insert into public.registers (register, lines) values
  ('dtc', array[
    'still havent left',
    'said next round then didnt',
    'keep leaving before it costs me',
    'told them i was nearly there',
    'finish faster when i want them out',
    'saved his number under a fake name'
  ]),
  ('social', array[
    'took the last piece i offered around',
    'said im full still eating',
    'picked the place i look best in',
    'topping everyone up but me',
    'loud all night quiet the whole way home',
    'already know who im telling'
  ]),
  ('intimate', array[
    'ordered the one i cant pronounce',
    'laughed before i heard it',
    'opened the good one on a tuesday',
    'said im not hungry then took his',
    'already telling it in my head',
    'texting someone else under the table'
  ]),
  ('edgy', array[
    'didnt come home with who i came with',
    'dressed for the photo not the night',
    'better company three drinks in',
    'blaming the room already',
    'know how this ends ordered another',
    'here for the version that doesnt reply'
  ])
on conflict (register) do nothing;
