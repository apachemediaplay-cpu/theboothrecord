-- ╔════════════════════════════════════════════════════════════════════╗
-- ║  APPLIED — completed and pasted in the Supabase dashboard.         ║
-- ║  The placeholder below was filled there with the live function     ║
-- ║  body; the applied version used p_mode DEFAULT 'solo' (the name at ║
-- ║  the time). The live rename to 'default' is 20260808100000. This   ║
-- ║  file stays as history parity; it is not a template to re-run.     ║
-- ╚════════════════════════════════════════════════════════════════════╝
--
-- Prompt-mode routing, corrected. The first version of this migration was
-- written against a 4-parameter create_confession that doesn't exist; it
-- created an ORPHANED 5-parameter overload (nothing calls it) and never
-- touched the live 6-parameter function:
--   create_confession(p_confession text, p_verdict text, p_source text,
--                     p_status text, p_stamp_venue boolean default true,
--                     p_topic text default null)
-- This corrective drops the orphan by its exact signature, adds the mode
-- column, and recreates the LIVE function with p_mode as a 7th parameter.
--
-- MODE NAME AS APPLIED: 'solo'. This migration ran with 'solo' as the
-- default; the ALTER below backfilled EVERY existing confession row with
-- mode='solo'. The live rename to 'default' (20260808100000) changes only
-- the defaults going forward — rows stamped 'solo' keep it: rewriting
-- history to match a naming decision loses the fact they were written under
-- the old name.
--
-- Storing the mode is the expensive-to-retrofit part: without the column you
-- can never ask whether verdicts from one prompt get shared more than
-- another. General routing layer, NOT round code.

-- 1. Drop the ORPHAN — named exactly. Five text parameters
--    (p_confession, p_verdict, p_source, p_status, p_mode). The live
--    function has boolean in position 5, so this signature cannot hit it.
drop function if exists public.create_confession(text, text, text, text, text);

-- 2. The mode column — as applied: default 'solo' (renamed to 'default' by
--    20260808100000; kept here as history parity).
alter table public.confessions
  add column if not exists mode text not null default 'solo';

-- 3. Recreate the LIVE function with p_mode appended. DROP then CREATE —
--    NOT create-or-replace, which would leave a third overload live. The
--    p_mode DEFAULT means the deployed edge function's current 6-argument
--    call keeps working the instant this lands, and keeps working until the
--    new edge block is pasted. No ordering requirement between the two.
drop function if exists public.create_confession(text, text, text, text, boolean, text);

-- ┌────────────────────────────────────────────────────────────────────┐
-- │  This block was a placeholder; it was FILLED IN THE DASHBOARD with │
-- │  the live body (edited three ways: p_mode text default 'solo' as   │
-- │  the 7th parameter; `mode` in the INSERT columns;                  │
-- │  coalesce(nullif(btrim(p_mode), ''), 'solo') in the values) and    │
-- │  applied there. The repo never held the body — the applied source  │
-- │  of truth is the database; 20260808100000 renames its defaults     │
-- │  in place via pg_get_functiondef without hand-copying it.          │
-- └────────────────────────────────────────────────────────────────────┘

-- 4. Grants restated for the new signature — mirror whatever the live
--    grants are (expected: revoke from public; grant execute to anon).
revoke all on function public.create_confession(text, text, text, text, boolean, text, text) from public;
grant execute on function public.create_confession(text, text, text, text, boolean, text, text) to anon;
