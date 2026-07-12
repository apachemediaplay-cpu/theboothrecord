import { useState, useEffect, useMemo, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// `topic` is a forward-only column not yet in the generated types (like the admin RPCs
// themselves). It's written by generate-verdict at confession time; the frontend only
// reads it. Nullable: rows created before the rollout have topic = null.
type Confession = Database["public"]["Tables"]["confessions"]["Row"] & {
  topic: string | null;
  is_test: boolean | null;
};
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

// Topic taxonomy written by generate-verdict at confession time. Keys are the stored
// values; labels are display-only. Older rows predate the rollout and have topic = null,
// surfaced as "Untagged" — never hidden. Unknown values fall back to the raw string, so
// adding a topic server-side can't crash the page before this list catches up.
const TOPICS: { value: string; label: string }[] = [
  { value: "wellness", label: "Wellness" },
  { value: "work", label: "Work" },
  { value: "dating_sex", label: "Dating & sex" },
  { value: "friendship", label: "Friendship" },
  { value: "family", label: "Family" },
  { value: "money", label: "Money" },
  { value: "food_drink", label: "Food & drink" },
  { value: "social_performance", label: "Social performance" },
  { value: "vanity", label: "Vanity" },
  { value: "substances", label: "Substances" },
  { value: "petty", label: "Petty" },
  { value: "other", label: "Other" },
];
const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  TOPICS.map((t) => [t.value, t.label]),
);

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

// Muted, unobtrusive counterpart to SourceBadge — a topic is metadata, not an action.
// null → a muted "untagged"; an unrecognised value falls back to the raw string.
const TopicBadge = ({ topic }: { topic: string | null }) => (
  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
    {topic ? TOPIC_LABELS[topic] ?? topic : "untagged"}
  </span>
);

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
  // "all" | one of the TOPICS values | "untagged" (rows with topic = null). Display-only,
  // composes with the other filters (AND); never touches a row's status.
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Metrics panel (read-only). Collapsed by default. The queue only ever holds ONE
  // status (admin_list_confessions filters by _status), so cross-status totals need
  // the full set. Rather than add an RPC, we call the SAME RPC with _status = null
  // (its body: `where (_status is null or ...)` → every status) exactly once, lazily
  // on first expand, and compute everything client-side. Never mutates a row.
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricsRows, setMetricsRows] = useState<Confession[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(false);
  // Aggregate reads for scan/share rates (admin RPCs). null = RPC unavailable (e.g. the
  // scan-tracking SQL hasn't been run yet) → the section says so instead of showing zeros.
  const [scanCounts, setScanCounts] = useState<{ source: string; scans: number }[] | null>(null);
  const [shareCounts, setShareCounts] = useState<{ source: string; shares: number }[] | null>(null);

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
    setTopicFilter("all");
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

  // One-shot fetch for the metrics panel. Confessions come from admin_list_confessions with
  // _status = null (every status, one call). Scans + shares come from admin-gated aggregate
  // RPCs (admin_scan_counts / admin_share_counts). All three fire in parallel on first
  // expand; the Refresh control re-runs them. Confessions failing = panel error; scans/shares
  // failing degrade to null (that section reports "unavailable") without blanking the rest.
  const loadMetrics = () => {
    setMetricsLoading(true);
    setMetricsError(false);
    Promise.all([
      rpc("admin_list_confessions", { _status: null }),
      rpc("admin_scan_counts"),
      rpc("admin_share_counts"),
    ]).then(([conf, scans, shares]) => {
      setMetricsLoading(false);
      if (conf.error) {
        setMetricsError(true);
        return;
      }
      setMetricsRows((conf.data as Confession[]) ?? []);
      setScanCounts(
        scans.error ? null : ((scans.data as { source: string; scans: number }[]) ?? []),
      );
      setShareCounts(
        shares.error ? null : ((shares.data as { source: string; shares: number }[]) ?? []),
      );
    });
  };

  const toggleMetrics = () => {
    const next = !metricsOpen;
    setMetricsOpen(next);
    if (next && metricsRows === null && !metricsLoading) loadMetrics();
  };

  // All counts derive from ONE base set: completed (verdict issued) and non-test. Using a
  // single denominator keeps every sub-total reconcilable. is_test is excluded only when
  // strictly true (null/older rows count as real). null topic → "untagged" so topics sum
  // to the total. Direct traffic is kept out of the per-venue topic breakdown.
  const metrics = useMemo(() => {
    if (!metricsRows) return null;
    const base = metricsRows.filter((r) => r.is_test !== true && r.verdict_text != null);
    const byStatus: Record<Status, number> = { pending: 0, approved: 0, rejected: 0 };
    const byVenue = new Map<string, number>();
    const byTopic = new Map<string, number>();
    const venueTopic = new Map<string, Map<string, number>>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const r of base) {
      if (r.status === "pending" || r.status === "approved" || r.status === "rejected") {
        byStatus[r.status] += 1;
      }
      bump(byVenue, r.source);
      const topicKey = r.topic ?? "untagged";
      bump(byTopic, topicKey);
      if (r.source !== "direct") {
        let tm = venueTopic.get(r.source);
        if (!tm) venueTopic.set(r.source, (tm = new Map()));
        bump(tm, topicKey);
      }
    }
    const byCountDesc = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0]);

    // Scan → completion → share funnel. scanCounts/shareCounts are null when their RPC is
    // unavailable; treat as empty maps for the math and surface availability via flags.
    const scanMap = new Map((scanCounts ?? []).map((r) => [r.source, r.scans]));
    const shareMap = new Map((shareCounts ?? []).map((r) => [r.source, r.shares]));
    const totalScans = [...scanMap.values()].reduce((a, b) => a + b, 0);
    const totalShares = [...shareMap.values()].reduce((a, b) => a + b, 0);

    // Completion = completed confessions ÷ scans, per source that has scans. rate is null on
    // divide-by-zero (→ "—"). Confessions are all-time, so a source with pre-tracking history
    // can read > 100% — flagged in the UI.
    const completionRows = [...scanMap.entries()].sort(byCountDesc).map(([source, scans]) => {
      const confessions = byVenue.get(source) ?? 0;
      return { source, scans, confessions, rate: scans > 0 ? confessions / scans : null };
    });

    // Share rate = share taps ÷ completed confessions. Overall + per source (union of sources
    // that have shares or completed confessions). rate null when the denominator is 0.
    const shareSources = [...new Set([...byVenue.keys(), ...shareMap.keys()])];
    const shareRows = shareSources
      .map((source) => {
        const shares = shareMap.get(source) ?? 0;
        const completed = byVenue.get(source) ?? 0;
        return { source, shares, completed, rate: completed > 0 ? shares / completed : null };
      })
      .sort((a, b) => b.shares - a.shares || a.source.localeCompare(b.source));

    return {
      total: base.length,
      byStatus,
      directCount: byVenue.get("direct") ?? 0,
      venueRows: [...byVenue].filter(([s]) => s !== "direct").sort(byCountDesc),
      topicRows: [...byTopic].sort(byCountDesc),
      venueTopicRows: [...byVenue]
        .filter(([s]) => s !== "direct")
        .sort(byCountDesc)
        .map(([venue, count]) => ({
          venue,
          count,
          topics: [...(venueTopic.get(venue) ?? new Map<string, number>())].sort(byCountDesc),
        })),
      // Funnel
      scansAvailable: scanCounts !== null,
      sharesAvailable: shareCounts !== null,
      totalScans,
      totalShares,
      completionRows,
      shareRows,
      overallShareRate: base.length > 0 ? totalShares / base.length : null,
    };
  }, [metricsRows, scanCounts, shareCounts]);

  const topicLabel = (key: string) => TOPIC_LABELS[key] ?? key;
  // Ratio → whole-percent string; null (divide-by-zero) → an em dash, never NaN.
  const fmtPct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

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
    if (topicFilter !== "all") {
      // "untagged" matches null topics; any other value is an exact match.
      if (topicFilter === "untagged" ? row.topic != null : row.topic !== topicFilter)
        return false;
    }
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

        {/* Metrics panel (read-only) — collapsed by default so it stays out of the way.
            Every count is over completed, non-test confessions across ALL statuses. */}
        <section className="rounded-lg border border-border">
          <button
            type="button"
            onClick={toggleMetrics}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
          >
            <span>Metrics</span>
            <span className="text-xs text-muted-foreground">
              {metricsOpen ? "Hide" : "Show"}
            </span>
          </button>

          {metricsOpen ? (
            <div className="space-y-5 border-t border-border px-4 py-4 text-xs">
              {metricsLoading ? (
                <p className="text-muted-foreground">Loading metrics…</p>
              ) : metricsError ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">Couldn't load metrics.</p>
                  <Button size="sm" variant="outline" onClick={loadMetrics}>
                    Retry
                  </Button>
                </div>
              ) : metrics ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground">
                      Completed (verdict issued), excluding test sessions · all statuses.
                    </p>
                    <Button size="sm" variant="ghost" onClick={loadMetrics}>
                      Refresh
                    </Button>
                  </div>

                  {/* 1. Totals */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">Totals</p>
                    <p>
                      Total confessions: <span className="font-semibold">{metrics.total}</span>
                    </p>
                    <p className="text-muted-foreground">
                      pending {metrics.byStatus.pending} · approved {metrics.byStatus.approved} ·
                      rejected {metrics.byStatus.rejected}
                    </p>
                  </div>

                  {/* 2. By venue — the primary metric. 'direct' shown separately. */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">By venue</p>
                    {metrics.venueRows.length === 0 ? (
                      <p className="text-muted-foreground">No venue traffic yet.</p>
                    ) : (
                      <table className="w-full max-w-xs">
                        <tbody>
                          {metrics.venueRows.map(([slug, n]) => (
                            <tr key={slug}>
                              <td className="py-0.5">{slug}</td>
                              <td className="py-0.5 text-right tabular-nums">{n}</td>
                            </tr>
                          ))}
                          <tr className="text-muted-foreground">
                            <td className="border-t border-border py-0.5">direct</td>
                            <td className="border-t border-border py-0.5 text-right tabular-nums">
                              {metrics.directCount}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* 3. By topic — desc, 'untagged' included so it sums to the total. */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">By topic</p>
                    <table className="w-full max-w-xs">
                      <tbody>
                        {metrics.topicRows.map(([key, n]) => (
                          <tr key={key} className={key === "untagged" ? "text-muted-foreground" : ""}>
                            <td className="py-0.5">{topicLabel(key)}</td>
                            <td className="py-0.5 text-right tabular-nums">{n}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 4. Topic × venue — per venue slug (never 'direct'), topics desc. */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">
                      Topics by venue
                    </p>
                    {metrics.venueTopicRows.length === 0 ? (
                      <p className="text-muted-foreground">No venue traffic yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.venueTopicRows.map(({ venue, count, topics }) => (
                          <div key={venue}>
                            <p className="font-medium">
                              {venue}{" "}
                              <span className="text-muted-foreground">· {count}</span>
                            </p>
                            <ul className="ml-3 text-muted-foreground">
                              {topics.map(([key, n]) => (
                                <li key={key} className="flex max-w-[16rem] justify-between">
                                  <span>{topicLabel(key)}</span>
                                  <span className="tabular-nums">{n}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 5. Scans & completion — scans by source + completion rate (confessions ÷
                      scans). Scans can't be backfilled, so completion is only meaningful for
                      the scan-tracking era; historical confessions can push a rate past 100%. */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">
                      Scans &amp; completion
                    </p>
                    {!metrics.scansAvailable ? (
                      <p className="text-muted-foreground">
                        Scan tracking isn't live yet — run the scan_events SQL to enable it.
                      </p>
                    ) : metrics.completionRows.length === 0 ? (
                      <p className="text-muted-foreground">No scans recorded yet.</p>
                    ) : (
                      <>
                        <p className="mb-1 text-muted-foreground">
                          Total scans: <span className="font-semibold text-foreground">{metrics.totalScans}</span>
                          {" · "}completion = confessions ÷ scans, since tracking went live
                          (older sources can exceed 100%).
                        </p>
                        <table className="w-full max-w-sm">
                          <thead>
                            <tr className="text-muted-foreground">
                              <td className="py-0.5">source</td>
                              <td className="py-0.5 text-right">scans</td>
                              <td className="py-0.5 text-right">conf.</td>
                              <td className="py-0.5 text-right">rate</td>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.completionRows.map(({ source, scans, confessions, rate }) => (
                              <tr key={source}>
                                <td className="py-0.5">{source}</td>
                                <td className="py-0.5 text-right tabular-nums">{scans}</td>
                                <td className="py-0.5 text-right tabular-nums">{confessions}</td>
                                <td className="py-0.5 text-right tabular-nums">{fmtPct(rate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>

                  {/* 6. Share rate — share taps ÷ completed confessions, overall + per source.
                      Counts every tap, so a source can exceed 100%. */}
                  <div>
                    <p className="mb-1 uppercase tracking-wide text-muted-foreground">Share rate</p>
                    {!metrics.sharesAvailable ? (
                      <p className="text-muted-foreground">
                        Share counts unavailable — run the admin_share_counts SQL.
                      </p>
                    ) : (
                      <>
                        <p className="mb-1 text-muted-foreground">
                          Overall:{" "}
                          <span className="font-semibold text-foreground">
                            {fmtPct(metrics.overallShareRate)}
                          </span>{" "}
                          ({metrics.totalShares} taps ÷ {metrics.total} confessions · counts every tap)
                        </p>
                        <table className="w-full max-w-sm">
                          <thead>
                            <tr className="text-muted-foreground">
                              <td className="py-0.5">source</td>
                              <td className="py-0.5 text-right">shares</td>
                              <td className="py-0.5 text-right">conf.</td>
                              <td className="py-0.5 text-right">rate</td>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.shareRows.map(({ source, shares, completed, rate }) => (
                              <tr key={source}>
                                <td className="py-0.5">{source}</td>
                                <td className="py-0.5 text-right tabular-nums">{shares}</td>
                                <td className="py-0.5 text-right tabular-nums">{completed}</td>
                                <td className="py-0.5 text-right tabular-nums">{fmtPct(rate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

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

        {/* Topic filter — client-side over loaded rows, composes with the other filters
            (AND). Display-only; never changes any row's status. Full static taxonomy plus
            "Untagged" for the pre-rollout null rows. */}
        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics</SelectItem>
            {TOPICS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
            <SelectItem value="untagged">Untagged</SelectItem>
          </SelectContent>
        </Select>

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
                    <TopicBadge topic={row.topic} />
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
