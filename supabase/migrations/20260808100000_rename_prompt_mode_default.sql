-- LIVE RENAME: prompt mode 'solo' → 'default'. This runs against a LIVE
-- stack: prompt_modes seeded (solo→52, round→52), confessions.mode live with
-- every existing row stamped 'solo', create_confession live with p_mode
-- DEFAULT 'solo' as its 7th parameter, and the edge function reading the
-- table (source=table in its logs).
--
-- WHY: 'solo' only meant something next to 'round', and the round is
-- shelved. 'default' says what it is — the prompt every confession gets
-- unless something says otherwise.
--
-- EXISTING ROWS KEEP mode='solo' — deliberately NOT rewritten. Rewriting
-- history to match a naming decision loses the fact those rows were written
-- under the old name. Only the three DEFAULTS change; rows born after this
-- are 'default'.
--
-- ORDER: paste this FIRST, then the edge function, then deploy the client.
-- Window while only this has landed: the deployed edge resolver looks up
-- 'solo', misses, and falls to its hardcoded "52" floor (source=fallback in
-- the logs) — verdicts keep working on the same version; the table just
-- isn't read, and rows written in the window still stamp 'solo'. The edge
-- paste closes the window (plus up to 60s of warm-instance cache tail).

-- 1. The table row. 'round' stays untouched — dormant, but it's the example
--    that shows the pattern.
update public.prompt_modes
   set mode = 'default', updated_at = now()
 where mode = 'solo';

-- 2. The column default — new rows only; existing rows keep their value.
alter table public.confessions
  alter column mode set default 'default';

-- 3. create_confession's p_mode DEFAULT (and any 'solo' fallback inside its
--    body), rewritten IN PLACE from the LIVE definition. The DO block reads
--    pg_get_functiondef itself, so this migration cannot drift from the
--    deployed body — no hand-copied source involved. CREATE OR REPLACE with
--    the identical signature replaces in place (no overload possible) and
--    PRESERVES the existing grants. Guards: exactly one create_confession
--    must exist, and its definition must still contain a 'solo' literal
--    (otherwise this already ran — refuse rather than guess).
do $$
declare
  _defs text[];
  _def  text;
begin
  select array_agg(pg_get_functiondef(p.oid))
    into _defs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_confession';

  if _defs is null or array_length(_defs, 1) <> 1 then
    raise exception 'expected exactly ONE create_confession, found % — resolve overloads first',
      coalesce(array_length(_defs, 1), 0);
  end if;

  _def := _defs[1];
  if position('''solo''' in _def) = 0 then
    raise exception 'create_confession has no ''solo'' literal — rename already applied?';
  end if;

  _def := replace(_def, '''solo''', '''default''');
  execute _def;
end $$;
