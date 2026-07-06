-- Captures the CURRENT live RLS state of public.confessions into the repo for parity.
-- Introspected from pg_policies on 7 Jul 2026 (the Supabase dashboard is the source of truth):
--   policyname = "public reads approved only", cmd = SELECT, roles = {anon},
--   qual = (status = 'approved'::text), with_check = NULL   — and NO other policy exists.
--
-- Idempotent (drop-if-exists then create; safe to re-run). Deliberately creates NO anon INSERT
-- policy: the permissive 'anyone can confess' INSERT policy was DROPPED as the moderation-bypass
-- fix (6 Jul) and must stay absent. All writes go through public.create_confession()
-- (SECURITY DEFINER → runs as owner, bypasses RLS, clamps status to pending/blocked).

-- RLS enabled on the table.
alter table public.confessions enable row level security;

-- The only policy on the table: public wall read — anon may SELECT approved rows only.
drop policy if exists "public reads approved only" on public.confessions;
create policy "public reads approved only"
  on public.confessions
  for select
  to anon
  using (status = 'approved');

-- Belt-and-braces: ensure the dropped permissive INSERT policy stays absent (do NOT re-add it).
drop policy if exists "anyone can confess" on public.confessions;

-- No INSERT / UPDATE / DELETE policy exists for anon — RLS default-deny covers those commands;
-- inserts happen ONLY via the SECURITY DEFINER RPC public.create_confession(...).
-- Verified live 6 Jul: a direct anon INSERT with status='approved' returns 401 (RLS reject).
