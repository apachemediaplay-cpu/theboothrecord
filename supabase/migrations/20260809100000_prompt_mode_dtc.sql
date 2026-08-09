-- DTC prompt mode: non-venue traffic (Instagram, shared cards, direct) gets
-- its own routable mode, separable from venue traffic for the first time.
-- Before this, "no source" fell through to 'default' — the same row unset
-- venues use — so the two populations couldn't be routed apart.
--
-- WHO SENDS WHAT (the client decides by SOURCE, synchronously at mount):
--   no source / 'direct'            → mode 'dtc'   (this row)
--   venue with prompt_mode set      → that mode
--   venue with no prompt_mode       → no mode sent → 'default'
--   attributed but unregistered slug→ no mode sent → 'default' (conservative:
--                                     attributed traffic stays venue-side)
--
-- Seeded at version 54 per instruction — mirroring the default mode's current
-- live version, so this is a change of ROUTING, not of behaviour. (If the
-- default is on a different version when this is pasted, one console edit in
-- the Prompt modes panel aligns them.)
--
-- FALLBACK CHAIN UNCHANGED: if this row is ever deleted, DTC traffic sends a
-- mode the table no longer has → the edge resolver falls to the 'default'
-- row, then to the hardcoded floor — degradation, never failure. Note that
-- admin_delete_prompt_mode's venue guard will NOT protect this row (no venue
-- ever points at 'dtc'; the client chooses it by absence of source) — which
-- is fine, because deleting it degrades gracefully by design.

insert into public.prompt_modes (mode, version)
values ('dtc', '54')
on conflict (mode) do nothing;
