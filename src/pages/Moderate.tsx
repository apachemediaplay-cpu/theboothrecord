import { useState, useEffect, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Confession = Database["public"]["Tables"]["confessions"]["Row"];
type Status = "pending" | "approved" | "rejected";

// The admin_* RPCs are not in the generated types (Functions is empty and can't be
// regenerated without DB access), so cast narrowly at the call sites.
type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
const rpc = sb.rpc.bind(sb) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => RpcResult<unknown>;

// Passive venue-sensitivity flag (brief item 4). Plain, case-insensitive substring
// match — no regex, no external calls. Edit this list + redeploy to tune it; false
// positives are harmless (it only draws the eye, it never takes an action). This is
// deliberately independent of the keyword search field (item 5): the flag catches the
// confessions you weren't looking for.
const WATCHWORDS = [
  // drug / personal-use
  "coke", "cocaine", "line", "lines", "pill", "pills", "mdma", "molly", "ket",
  "ketamine", "weed", "meth", "heroin", "acid", "shroom", "shrooms",
  // sexual
  "sex", "nude", "nudes", "porn", "escort", "hooker",
  // violence
  "kill", "hit", "punch", "stab", "gun", "knife", "assault",
];

const TABS: Status[] = ["pending", "approved", "rejected"];

const flagText = (row: Confession) =>
  `${row.confession_text} ${row.verdict_text ?? ""}`.toLowerCase();

const isFlagged = (row: Confession) => {
  const hay = flagText(row);
  return WATCHWORDS.some((w) => hay.includes(w));
};

const sortDesc = (a: Confession, b: Confession) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

const SourceBadge = ({ source }: { source: string }) => {
  const isVenue = !!source && source !== "direct";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium",
        isVenue
          ? "bg-ritual/15 text-ritual border border-ritual/30"
          : "bg-muted text-muted-foreground",
      )}
    >
      {source}
    </span>
  );
};

const Moderate = () => {
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const [tab, setTab] = useState<Status>("pending");
  const [rows, setRows] = useState<Confession[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Client-side filters over the already-loaded rows (brief item 5). Neither touches
  // the DB or any row's status; the keyword search is a filter, not a highlighter.
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Session bootstrap + magic-link redirect. This client (and only this client)
  // has detectSessionInUrl:true, so it parses the token off the /moderate URL.
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load rows for the active tab whenever the session or tab changes. A non-admin
  // session gets 'not authorized' from the RPC body (is_admin() check) — the data
  // layer, not the route, is the guard. admin_list_confessions is SECURITY DEFINER,
  // so the Approved/Rejected tabs return rows anon RLS would otherwise hide.
  useEffect(() => {
    if (!session) {
      setRows([]);
      setNotAuthorized(false);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    setNotAuthorized(false);
    rpc("admin_list_confessions", { _status: tab }).then(({ data, error }) => {
      if (cancelled) return;
      setLoadingRows(false);
      if (error) {
        setNotAuthorized(true);
        setRows([]);
        return;
      }
      setRows((data as Confession[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [session, tab]);

  const changeTab = (next: Status) => {
    if (next === tab) return;
    setTab(next);
    setSourceFilter("all");
    setSearch("");
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSending(true);
    const { error } = await sb.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/moderate` },
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send link", description: error.message, variant: "destructive" });
      return;
    }
    setLinkSent(true);
  };

  const signOut = async () => {
    await sb.auth.signOut();
    setSession(null);
    setNotAuthorized(false);
    setRows([]);
    setLinkSent(false);
  };

  // Restore a row to the status it had before the last action. The single undo path
  // for every action (approve/reject/un-approve/restore). Re-inserts the row into the
  // list only if its restored status belongs in the currently-viewed tab.
  const undoStatus = async (row: Confession, originalStatus: Status) => {
    const { error } = await rpc("admin_set_status", { _id: row.id, _status: originalStatus });
    if (error) {
      toast({ title: "Undo failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) =>
      originalStatus === tab
        ? [...prev.filter((r) => r.id !== row.id), { ...row, status: originalStatus }].sort(sortDesc)
        : prev,
    );
    toast({ title: "Restored", description: `#${row.subject_number}` });
  };

  // The one handler behind every status change. Optimistically removes the row, calls
  // the RPC, and on success shows an undo toast. On failure the row is restored to the
  // list. duration is a per-toast Radix prop: approve gets a longer window because it
  // publishes to the live public wall (see brief item 2). The toast is convenience;
  // the durable safety net is the Approved-tab un-approve control, always available.
  const applyStatus = async (
    row: Confession,
    newStatus: Status,
    opts: { title: string; duration: number },
  ) => {
    const original = row.status as Status;
    setBusyId(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const { error } = await rpc("admin_set_status", { _id: row.id, _status: newStatus });
    setBusyId(null);
    if (error) {
      setRows((prev) => [...prev, row].sort(sortDesc));
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: opts.title,
      description: `#${row.subject_number}`,
      duration: opts.duration,
      action: (
        <ToastAction altText={`Undo, restore #${row.subject_number}`} onClick={() => undoStatus(row, original)}>
          Undo
        </ToastAction>
      ),
    });
  };

  // --- Render states --------------------------------------------------------

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  // Logged out: email + magic link.
  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <form onSubmit={sendLink} className="w-full max-w-sm space-y-4">
          <h1 className="text-lg font-semibold">Moderation</h1>
          {linkSent ? (
            <p className="text-sm text-muted-foreground">
              Check your inbox for a sign-in link, then return to this page.
            </p>
          ) : (
            <>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@houseofguilty.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Send magic link"}
              </Button>
            </>
          )}
        </form>
      </main>
    );
  }

  // Logged in, but not an admin: RPC rejected.
  if (notAuthorized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-muted-foreground">Not authorized.</p>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  // Logged in admin: the queue.
  const sources = Array.from(new Set(rows.map((r) => r.source))).sort();
  const visibleRows = rows.filter((row) => {
    if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!`${row.confession_text} ${row.verdict_text ?? ""}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold capitalize">
            {tab}
            {rows.length ? ` · ${rows.length}` : ""}
          </h1>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>

        {/* Status tabs (item 5) */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={t === tab ? "secondary" : "ghost"}
              className="capitalize"
              onClick={() => changeTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {/* Source filter (item 5) — only meaningful with more than one source present */}
        {sources.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant={sourceFilter === "all" ? "secondary" : "ghost"}
              onClick={() => setSourceFilter("all")}
            >
              All
            </Button>
            {sources.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={sourceFilter === s ? "secondary" : "ghost"}
                onClick={() => setSourceFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        ) : null}

        {/* Keyword search (item 5) — active, on-demand filter over loaded rows only.
            Distinct from the passive amber flag; never changes any row's status. */}
        <Input
          type="search"
          placeholder="Search confession or verdict text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loadingRows ? (
          <p className="text-sm text-muted-foreground">Loading queue…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground capitalize">Nothing {tab}.</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches. Clear the filters to see all.</p>
        ) : (
          <ul className="space-y-4">
            {visibleRows.map((row) => {
              const flagged = isFlagged(row);
              return (
                <li
                  key={row.id}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-3",
                    flagged && "border-l-4 border-l-amber-500",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>#{row.subject_number}</span>
                    <SourceBadge source={row.source} />
                    <span>{new Date(row.created_at).toLocaleString()}</span>
                    {flagged ? (
                      <span className="rounded bg-amber-500/15 text-amber-500 px-1.5 py-0.5 text-[11px] font-medium">
                        review
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{row.confession_text}</p>
                  {row.verdict_text ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground border-l-2 border-border pl-3">
                      {row.verdict_text}
                    </p>
                  ) : null}

                  {/* Action row varies by tab. The Approved tab's un-approve is the
                      durable, always-available safety net (item 2, Layer 2) — it does
                      not depend on the toast lifecycle. */}
                  <div className="flex gap-2">
                    {tab === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          className="bg-ritual text-background hover:bg-ritual/90"
                          disabled={busyId === row.id}
                          onClick={() =>
                            applyStatus(row, "approved", { title: "Approved", duration: 9000 })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === row.id}
                          onClick={() =>
                            applyStatus(row, "rejected", { title: "Rejected", duration: 5000 })
                          }
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}

                    {tab === "approved" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === row.id}
                        onClick={() =>
                          applyStatus(row, "rejected", {
                            title: "Un-approved — off the wall",
                            duration: 5000,
                          })
                        }
                      >
                        Un-approve
                      </Button>
                    ) : null}

                    {tab === "rejected" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() =>
                          applyStatus(row, "pending", {
                            title: "Restored to pending",
                            duration: 5000,
                          })
                        }
                      >
                        Restore to pending
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
};

export default Moderate;
