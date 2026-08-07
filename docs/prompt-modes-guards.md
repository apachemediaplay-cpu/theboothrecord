# Prompt modes editor: delete guard, usage counts, version note

**Status: built and clean — migration awaiting paste, client awaiting deploy.
Nothing applied.**

## 1. Delete didn't exist — built with the guards from birth

Confirmed before writing: the editor had add and set only — no delete RPC, no
delete UI anywhere. So the migration below creates `admin_delete_prompt_mode`
with both guards inside it; there was never an unguarded moment.

- **`'default'` can never be deleted** — refused by name in the function
  ("the default mode cannot be deleted — it is the system fallback"), and the
  console goes one further: the default row renders **no delete control at
  all**, so the refusal can't even be provoked from the UI.
- **A mode any venue uses refuses, naming the venues** — `string_agg` of the
  venue sources into the raise, exactly `admin_delete_venue`'s refusal shape
  ("mode is used by highballcbr, ovolosy, clear those venues first"),
  surfacing verbatim in the console toast.
- One deliberate non-guard, recorded in the function comment: historical
  `confessions.mode` stamps do **not** block deletion — rows record what
  answered them at the time, and that history stays valid after a mode
  retires.

The console delete sits behind a confirm dialog matching the venue-delete
pattern, and is NOT optimistic — the row leaves the list only after the
server confirms.

## 2. Usage counts — and why raw counts would have been wrong

The backfill stamped every historical row with the **old name, `'solo'`** —
and after the rename, `'solo'` isn't even in prompt_modes. Raw counts would
therefore show `default` with only post-rename rows (misleadingly tiny) while
the entire backfilled history sat invisible under a mode name that no longer
displays anywhere. The biggest number in the system would simply vanish.

**Presentation chosen:** fold `'solo'` into the default row's count — all
those rows were answered by the default prompt lineage, so the fold is
factually honest — **and label the default row's count "(all time)"**, so

    default · 52 · 8 venues · 1,402 confessions (all time)
    round · 52 · no venues · 0 confessions

reads as what it is, never as "confessions since this mode existed."
Non-default modes show raw counts, which ARE mode-era accurate: those names
only exist post-routing. The RPC returns raw per-mode counts; the fold and
label live client-side with the reasoning in a comment. Test rows are
excluded, matching every other console count.

**Reads:**

- Venue counts need **no query at all** — derived client-side from the
  already-fetched venues list, with a null `prompt_mode` counting toward
  `default` (that is what null resolves to).
- Confession counts needed **one new RPC** — nothing existing aggregates
  `confessions.mode`. `admin_prompt_mode_usage()` (below) **rides the
  existing prompt_modes fetch** via Promise.all — same venues-tab gate, same
  Retry tick, zero new per-load queries.
- Either read failing means **no usage line at all** — never zeros that look
  like real counts.

## 3. The version note

One line in the console's muted register, directly under the section's
existing "affects every confession within about a minute" line:

> Versions must exist in OpenAI. A version that doesn't will fail every
> confession using its mode.

Not a banner, not a confirm. Placement note: the editor has a version field
per row plus the add row, so a per-field repetition would be noise — the
single line under the header serves them all.

---

## The migration

Repo path: `supabase/migrations/20260808120000_prompt_mode_usage_delete.sql`

```sql
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
```

## The client diff

`src/pages/Moderate.tsx` (this change only — the working tree against the
last commit):

```diff
diff --git a/src/pages/Moderate.tsx b/src/pages/Moderate.tsx
index 9e94ab6..1b53a6d 100644
--- a/src/pages/Moderate.tsx
+++ b/src/pages/Moderate.tsx
@@ -937,28 +937,81 @@ const PromptModeRow = ({
   mode,
   initialVersion,
   busy,
+  usage,
   onSave,
+  onDelete,
 }: {
   mode: string;
   initialVersion: string;
   busy: boolean;
+  // The usage line: venue count derived client-side from venuesRows (null
+  // prompt_mode counts toward 'default' — that's what null resolves to);
+  // confession count from admin_prompt_mode_usage, with the backfilled
+  // 'solo' stamps folded into the default row. Null = usage read failed —
+  // the line is simply absent rather than showing zeros that look real.
+  usage: { venues: number; confessions: number; allTime: boolean } | null;
   onSave: (version: string) => void;
+  // Absent for 'default' — the fallback the whole system rests on can never
+  // offer a delete control at all.
+  onDelete?: () => void;
 }) => {
   const [version, setVersion] = useState(initialVersion);
   const dirty = version.trim() !== initialVersion.trim();
   const valid = version.trim() !== "";
   return (
-    <div className="flex items-center gap-2">
-      <span className="w-20 shrink-0 font-mono-light text-xs uppercase tracking-wide">{mode}</span>
-      <Input
-        value={version}
-        maxLength={40}
-        onChange={(e) => setVersion(e.target.value)}
-        className="h-8 w-full text-xs"
-      />
-      <Button size="sm" disabled={!dirty || !valid || busy} onClick={() => onSave(version.trim())}>
-        {busy ? "Saving…" : "Save"}
-      </Button>
+    <div className="space-y-0.5">
+      <div className="flex items-center gap-2">
+        <span className="w-20 shrink-0 font-mono-light text-xs uppercase tracking-wide">
+          {mode}
+        </span>
+        <Input
+          value={version}
+          maxLength={40}
+          onChange={(e) => setVersion(e.target.value)}
+          className="h-8 w-full text-xs"
+        />
+        <Button size="sm" disabled={!dirty || !valid || busy} onClick={() => onSave(version.trim())}>
+          {busy ? "Saving…" : "Save"}
+        </Button>
+        {onDelete ? (
+          <AlertDialog>
+            <AlertDialogTrigger asChild>
+              <button
+                type="button"
+                disabled={busy}
+                className="text-[11px] text-destructive/80 underline underline-offset-2 transition-colors hover:text-destructive"
+              >
+                Delete
+              </button>
+            </AlertDialogTrigger>
+            <AlertDialogContent>
+              <AlertDialogHeader>
+                <AlertDialogTitle>Delete mode {mode}?</AlertDialogTitle>
+                <AlertDialogDescription>
+                  A mode any venue is using will refuse to delete and name the venues.
+                  Historical confessions keep their {mode} stamp either way.
+                </AlertDialogDescription>
+              </AlertDialogHeader>
+              <AlertDialogFooter>
+                <AlertDialogCancel>Cancel</AlertDialogCancel>
+                <AlertDialogAction
+                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
+                  onClick={onDelete}
+                >
+                  Delete {mode}
+                </AlertDialogAction>
+              </AlertDialogFooter>
+            </AlertDialogContent>
+          </AlertDialog>
+        ) : null}
+      </div>
+      {usage ? (
+        <p className="pl-20 text-[10px] text-muted-foreground/70 tabular-nums">
+          {usage.venues === 0 ? "no venues" : `${usage.venues} venue${usage.venues === 1 ? "" : "s"}`} ·{" "}
+          {usage.confessions.toLocaleString()} confession{usage.confessions === 1 ? "" : "s"}
+          {usage.allTime ? " (all time)" : ""}
+        </p>
+      ) : null}
     </div>
   );
 };
@@ -1211,6 +1264,12 @@ const Moderate = () => {
     { mode: string; version: string }[] | null | undefined
   >(undefined);
   const [promptModeBusy, setPromptModeBusy] = useState<string | null>(null);
+  // Confession counts by RAW mode (admin_prompt_mode_usage): undefined =
+  // loading, null = failed → no usage line. Folding/labelling happens in
+  // promptModeUsageFor, not here.
+  const [promptModeUsage, setPromptModeUsage] = useState<Map<string, number> | null | undefined>(
+    undefined,
+  );
 
   // Pending count for the Moderate tab label. Tracks the persistent filters
   // (venue, range) — not the queue's sub-tab or search.
@@ -1654,39 +1713,82 @@ const Moderate = () => {
   // Plain table select: the "admins read prompt_modes" policy (is_admin()-
   // gated) is the console's read path; the table is deliberately not
   // anon-readable and the edge function reads it with the service role.
+  // The usage counts RIDE ALONG here (admin_prompt_mode_usage — confession
+  // counts by raw mode) rather than adding a per-load query anywhere else;
+  // venue counts need no read at all (derived from venuesRows client-side).
+  // A failed usage read degrades to no usage line, never to fake zeros, and
+  // never blocks the editor itself.
   useEffect(() => {
     if (!session || consoleTab !== "venues") return;
     let cancelled = false;
     setPromptModes(undefined);
+    setPromptModeUsage(undefined);
     const from = sb.from.bind(sb) as unknown as (table: string) => {
       select(cols: string): PromiseLike<{
         data: { mode: string; version: string }[] | null;
         error: unknown;
       }>;
     };
-    Promise.resolve(from("prompt_modes").select("mode,version")).then(
-      (r) => {
-        if (cancelled) return;
-        if (r.error || !r.data) {
-          setPromptModes(null);
-          return;
-        }
+    Promise.all([
+      Promise.resolve(from("prompt_modes").select("mode,version")).then(
+        (r) => r,
+        () => ({ data: null, error: { message: "request failed" } }),
+      ),
+      safe(rpc("admin_prompt_mode_usage")),
+    ]).then(([modes, usage]) => {
+      if (cancelled) return;
+      if (modes.error || !modes.data) {
+        setPromptModes(null);
+      } else {
         // 'default' first (the norm), then alphabetical.
         setPromptModes(
-          [...r.data].sort((a, b) =>
+          [...modes.data].sort((a, b) =>
             a.mode === "default" ? -1 : b.mode === "default" ? 1 : a.mode.localeCompare(b.mode),
           ),
         );
-      },
-      () => {
-        if (!cancelled) setPromptModes(null);
-      },
-    );
+      }
+      if (usage.error || !Array.isArray(usage.data)) {
+        setPromptModeUsage(null);
+      } else {
+        setPromptModeUsage(
+          new Map(
+            (usage.data as { mode: string; confessions: number | string }[]).map((r) => [
+              r.mode,
+              num(r.confessions),
+            ]),
+          ),
+        );
+      }
+    });
     return () => {
       cancelled = true;
     };
   }, [session, consoleTab, refreshTick]);
 
+  // Per-mode usage for the editor's line. VENUES: from venuesRows, with a
+  // null prompt_mode counting toward 'default' — that is what null resolves
+  // to. CONFESSIONS: raw counts from admin_prompt_mode_usage, with the
+  // BACKFILLED 'solo' stamps folded into the default row — every pre-routing
+  // confession was stamped 'solo' by the mode backfill, and all of them were
+  // answered by the default prompt lineage, but the resulting number is
+  // "every confession ever", NOT "confessions since this mode existed" — so
+  // the default row's count carries an explicit "(all time)" label rather
+  // than letting it masquerade as mode-era volume. Either read failing means
+  // NO line (null), never zeros that look like real counts.
+  const promptModeUsageFor = (
+    mode: string,
+  ): { venues: number; confessions: number; allTime: boolean } | null => {
+    if (!promptModeUsage || !venuesRows) return null;
+    const venues = venuesRows.filter((v) =>
+      mode === "default"
+        ? !v.prompt_mode || v.prompt_mode === "default"
+        : v.prompt_mode === mode,
+    ).length;
+    const own = promptModeUsage.get(mode) ?? 0;
+    const confessions = mode === "default" ? own + (promptModeUsage.get("solo") ?? 0) : own;
+    return { venues, confessions, allTime: mode === "default" };
+  };
+
   // Save / add via the admin RPCs. NOT optimistic — a mode's version decides
   // which prompt answers live confessions; local state updates only after the
   // server confirms.
@@ -1724,6 +1826,26 @@ const Moderate = () => {
     return true;
   };
 
+  // Delete via admin_delete_prompt_mode — the GUARDS live server-side and
+  // their raise messages surface here verbatim (same pattern as venue
+  // delete): 'default' can never be deleted, and a mode any venue points at
+  // refuses, naming the venues. NOT optimistic.
+  const deletePromptMode = async (mode: string) => {
+    setPromptModeBusy(mode);
+    const { error } = await rpc("admin_delete_prompt_mode", { _mode: mode });
+    setPromptModeBusy(null);
+    if (error) {
+      toast({
+        title: "Couldn't delete prompt mode",
+        description: error.message,
+        variant: "destructive",
+      });
+      return;
+    }
+    setPromptModes((prev) => prev?.filter((r) => r.mode !== mode) ?? prev);
+    toast({ title: "Prompt mode deleted", description: mode });
+  };
+
   // Save via admin_set_site_copy. NOT optimistic — this copy fronts the live
   // confess screen for all non-venue traffic; local state updates only after the
   // server confirms.
@@ -2819,12 +2941,17 @@ const Moderate = () => {
             for a two-row table is navigation furniture. */}
         <section className="rounded-lg border border-border px-4 py-3">
           <p className="text-sm font-medium">Prompt modes</p>
-          {/* The warning is a quiet line, not a modal or a confirm — changing
-              a version is a deliberate action taken rarely, not something to
-              guard against. */}
-          <p className="mb-2 text-xs text-muted-foreground">
+          {/* Both cautions are quiet lines, not modals or confirms — these are
+              deliberate actions taken rarely; they need stating once, not
+              guarding against. The second line sits here because every version
+              field in the list shares it. */}
+          <p className="text-xs text-muted-foreground">
             A change affects every confession using that mode within about a minute.
           </p>
+          <p className="mb-2 text-xs text-muted-foreground">
+            Versions must exist in OpenAI. A version that doesn't will fail every confession
+            using its mode.
+          </p>
           {promptModes === undefined ? (
             <p className="py-2 text-sm text-muted-foreground">Loading…</p>
           ) : promptModes === null ? (
@@ -2842,7 +2969,9 @@ const Moderate = () => {
                   mode={r.mode}
                   initialVersion={r.version}
                   busy={promptModeBusy === r.mode}
+                  usage={promptModeUsageFor(r.mode)}
                   onSave={(v) => savePromptMode(r.mode, v)}
+                  onDelete={r.mode === "default" ? undefined : () => deletePromptMode(r.mode)}
                 />
               ))}
               <AddPromptModeRow
```

## Behaviour until the migration lands

The editor renders as before; the usage line is simply absent (the failed
usage read returns null → no line), and a Delete click surfaces the
RPC-missing error in the toast. Nothing breaks in either deploy order, and
the migration depends on nothing else pending — the client-side fold handles
`'solo'` rows whether or not the rename migration has run.
