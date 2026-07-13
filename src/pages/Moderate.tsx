import { useState, useEffect, useMemo, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import venuesData from "@/data/venues.json";
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
import { venueDisplayName } from "@/lib/source";
import { cn } from "@/lib/utils";

// `topic`/`is_test` are forward-only columns not in the generated types; the frontend
// only reads them (written server-side by generate-verdict / tag_confession).
type Confession = Database["public"]["Tables"]["confessions"]["Row"] & {
  topic: string | null;
  is_test: boolean | null;
};
type Status = "pending" | "approved" | "rejected";

// The admin_* RPCs are not in the generated types, so cast narrowly at the call sites.
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = sb.rpc.bind(sb) as unknown as (fn: string, args?: Record<string, unknown>) => RpcResult;

// Normalise a rejected promise AND a resolved {error} into one shape, so one failed
// sub-fetch can never reject a Promise.all and freeze the page (see the console rebuild
// notes). A failed call surfaces as its section's "unavailable" state, never a blank.
const safe = (p: RpcResult): Promise<{ data: unknown; error: { message: string } | null }> =>
  Promise.resolve(p).then(
    (r) => r,
    () => ({ data: null, error: { message: "request failed" } }),
  );

// ── New RPC row shapes (all admin-gated, verified live in Supabase) ──
type ScanCount = { source: string; scans: number | string };
type ShareCount = { source: string; shares: number | string };
type ShareNight = { night: string; source: string; shares: number | string };
type ConfCount = {
  night: string;
  source: string;
  topic: string | null;
  status: string;
  completed: number | string;
  total: number | string;
};
type VenueReport = {
  source: string;
  scans: number | string;
  confessions: number | string;
  completion_rate: number | string | null;
  shares: number | string;
  share_rate: number | string | null;
  nights_active: number | string;
  first_night: string | null;
  last_night: string | null;
  top_topics: { topic: string; n: number }[] | null;
};

const PAGE_SIZE = 50;

// Date-range control. _from is a NIGHT-BUCKET date (not a calendar date): a bucket is
// (created_at at tz) − 4h, cast to date. We compute _from the same way client-side so it
// agrees with the server bucketing. _to stays null (unbounded → up to now).
type Range = "7" | "30" | "all";
const RANGE_NIGHTS: Record<Range, number> = { "7": 7, "30": 30, all: Infinity };
const RANGE_LABELS: Record<Range, string> = {
  "7": "Last 7 nights",
  "30": "Last 30 nights",
  all: "All time",
};

const WATCHWORDS = [
  "coke", "cocaine", "line", "lines", "pill", "pills", "mdma", "molly", "ket",
  "ketamine", "weed", "meth", "heroin", "acid", "shroom", "shrooms",
  "sex", "nude", "nudes", "porn", "escort", "hooker",
  "kill", "hit", "punch", "stab", "gun", "knife", "assault",
];

const TABS: Status[] = ["pending", "approved", "rejected"];

const TOPIC_LABELS: Record<string, string> = {
  wellness: "Wellness",
  work: "Work",
  dating_sex: "Dating & sex",
  friendship: "Friendship",
  family: "Family",
  money: "Money",
  food_drink: "Food & drink",
  social_performance: "Social performance",
  vanity: "Vanity",
  substances: "Substances",
  petty: "Petty",
  other: "Other",
};
const topicLabel = (key: string) => TOPIC_LABELS[key] ?? key;

// Venue selector options (the primary axis). Known venues only; slug shown to disambiguate
// the several Frenchie slugs. "All venues" is prepended in the JSX.
const VENUE_OPTIONS = Object.entries(venuesData as Record<string, { displayName: string }>)
  .map(([slug, v]) => ({ slug, name: v.displayName }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmtYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "YYYY-MM-DD" → "Sat 19 Jul" (comma-free, locale-stable). Parsed as local midnight.
const formatNightLabel = (night: string | null) => {
  if (!night) return "—";
  const d = new Date(`${night}T00:00:00`);
  if (Number.isNaN(d.getTime())) return night;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// _from for a range: the night bucket N−1 days before tonight's bucket (so "7 nights" =
// tonight + the 6 before it). All time → null. Same 4am shift as the server.
const nightBucketFrom = (nightsBack: number): string | null => {
  if (!Number.isFinite(nightsBack)) return null;
  const d = new Date();
  d.setHours(d.getHours() - 4);
  d.setDate(d.getDate() - (nightsBack - 1));
  return fmtYmd(d);
};

// Ratio (0–1+) → whole-percent; null → em dash, never NaN. Server rates are assumed to be
// fractions (matches the client convention confessions/scans); see the report card note.
const fmtPct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const num = (v: number | string | null | undefined) => Number(v) || 0;

const isFlagged = (row: Confession) => {
  const hay = `${row.confession_text} ${row.verdict_text ?? ""}`.toLowerCase();
  return WATCHWORDS.some((w) => hay.includes(w));
};

const SourceBadge = ({ source }: { source: string }) => {
  const isVenue = !!source && source !== "direct";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium",
        isVenue ? "bg-ritual/15 text-ritual border border-ritual/30" : "bg-muted text-muted-foreground",
      )}
    >
      {source}
    </span>
  );
};

const TopicBadge = ({ topic }: { topic: string | null }) => (
  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
    {topic ? topicLabel(topic) : "untagged"}
  </span>
);

const Moderate = () => {
  const { toast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);

  // Page-wide axes: date range (drives every RPC) + venue (primary axis).
  const [range, setRange] = useState<Range>("30");
  const [venue, setVenue] = useState<string>("all");

  // Confession list (server-side + paginated).
  const [tab, setTab] = useState<Status>("pending");
  const [qInput, setQInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Confession[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Cross-venue rollup (venue === "all").
  const [rollupOpen, setRollupOpen] = useState(true);
  const [rollup, setRollup] = useState<{
    conf: ConfCount[];
    scans: ScanCount[] | null;
    shares: ShareCount[] | null;
    nights: ShareNight[] | null;
  } | null>(null);
  const [rollupLoading, setRollupLoading] = useState(false);
  const [rollupError, setRollupError] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Single-venue report (venue !== "all").
  const [report, setReport] = useState<VenueReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  // _from recomputed when the range changes. _to null = unbounded (up to now).
  const fromDate = useMemo(() => nightBucketFrom(RANGE_NIGHTS[range]), [range]);
  const rangeArgs = useMemo(
    () => ({ _tz: tz, _from: fromDate, _to: null }),
    [tz, fromDate],
  );

  // Session bootstrap + magic-link redirect (this client has detectSessionInUrl:true).
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Debounce the search box, and reset to page 1 whenever the query settles.
  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(qInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  // ── Confession list + count (server-side: status, source, keyword, range, paging) ──
  useEffect(() => {
    if (!session) {
      setRows([]);
      setTotalCount(0);
      setNotAuthorized(false);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(false);
    const filters = {
      _status: tab,
      _source: venue === "all" ? null : venue,
      _q: qDebounced.trim() || null,
      ...rangeArgs,
    };
    Promise.all([
      safe(rpc("admin_list_confessions", { ...filters, _limit: PAGE_SIZE, _offset: page * PAGE_SIZE })),
      safe(rpc("admin_list_confessions_count", filters)),
    ]).then(([list, count]) => {
      if (cancelled) return;
      setListLoading(false);
      if (list.error) {
        // The list RPC is the auth gate: is_admin() failures say "not authorized".
        if (/authoriz/i.test(list.error.message)) setNotAuthorized(true);
        else setListError(true);
        setRows([]);
        setTotalCount(0);
        return;
      }
      setNotAuthorized(false);
      setRows((list.data as Confession[]) ?? []);
      setTotalCount(count.error ? 0 : num(count.data as number));
    });
    return () => {
      cancelled = true;
    };
  }, [session, venue, tab, qDebounced, page, rangeArgs, refreshTick]);

  // ── Cross-venue rollup (only when "All venues") ──
  useEffect(() => {
    if (!session || venue !== "all") return;
    let cancelled = false;
    setRollupLoading(true);
    setRollupError(false);
    Promise.all([
      safe(rpc("admin_confession_counts", rangeArgs)),
      safe(rpc("admin_scan_counts", rangeArgs)),
      safe(rpc("admin_share_counts", rangeArgs)),
      safe(rpc("admin_share_nights", rangeArgs)),
    ]).then(([conf, scans, shares, nights]) => {
      if (cancelled) return;
      setRollupLoading(false);
      if (conf.error) {
        setRollupError(true);
        return;
      }
      setRollup({
        conf: (conf.data as ConfCount[]) ?? [],
        scans: scans.error ? null : ((scans.data as ScanCount[]) ?? []),
        shares: shares.error ? null : ((shares.data as ShareCount[]) ?? []),
        nights: nights.error ? null : ((nights.data as ShareNight[]) ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session, venue, rangeArgs, refreshTick]);

  // ── Single-venue report (only when a venue is selected) ──
  useEffect(() => {
    if (!session || venue === "all") return;
    let cancelled = false;
    setReportLoading(true);
    setReportError(false);
    safe(rpc("admin_venue_report", { _source: venue, ...rangeArgs })).then((res) => {
      if (cancelled) return;
      setReportLoading(false);
      if (res.error) {
        setReportError(true);
        setReport(null);
        return;
      }
      // Function returns a single row: supabase may hand it back bare or as a 1-element array.
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      setReport((row as VenueReport) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [session, venue, rangeArgs, refreshTick]);

  // Pivot admin_confession_counts (long form) into the rollup dashboard shape. This REPLACES
  // the old client-side row counting — the list is now paged, so totals must come from here.
  const dash = useMemo(() => {
    if (!rollup) return null;
    let totalAll = 0;
    let totalCompleted = 0;
    const byStatus: Record<Status, number> = { pending: 0, approved: 0, rejected: 0 };
    const byVenue = new Map<string, number>(); // completed per source
    const byTopic = new Map<string, number>(); // completed per topic
    const venueTopic = new Map<string, Map<string, number>>();
    const nightConf = new Map<string, { night: string; source: string; confessions: number }>();
    for (const r of rollup.conf) {
      const completed = num(r.completed);
      const total = num(r.total);
      totalAll += total;
      totalCompleted += completed;
      if (r.status === "pending" || r.status === "approved" || r.status === "rejected") {
        byStatus[r.status] += total;
      }
      byVenue.set(r.source, (byVenue.get(r.source) ?? 0) + completed);
      const topicKey = r.topic ?? "untagged";
      byTopic.set(topicKey, (byTopic.get(topicKey) ?? 0) + completed);
      if (r.source !== "direct") {
        let tm = venueTopic.get(r.source);
        if (!tm) venueTopic.set(r.source, (tm = new Map()));
        tm.set(topicKey, (tm.get(topicKey) ?? 0) + completed);
        if (r.night) {
          const k = `${r.night}|${r.source}`;
          const e = nightConf.get(k) ?? { night: r.night, source: r.source, confessions: 0 };
          e.confessions += completed;
          nightConf.set(k, e);
        }
      }
    }
    const byCountDesc = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0]);

    const scanMap = new Map((rollup.scans ?? []).map((r) => [r.source, num(r.scans)]));
    const shareMap = new Map((rollup.shares ?? []).map((r) => [r.source, num(r.shares)]));
    const totalScans = [...scanMap.values()].reduce((a, b) => a + b, 0);
    const totalShares = [...shareMap.values()].reduce((a, b) => a + b, 0);

    const completionRows = [...scanMap.entries()].sort(byCountDesc).map(([source, scans]) => {
      const confessions = byVenue.get(source) ?? 0;
      return { source, scans, confessions, rate: scans > 0 ? confessions / scans : null };
    });
    const shareRows = [...new Set([...byVenue.keys(), ...shareMap.keys()])]
      .map((source) => {
        const shares = shareMap.get(source) ?? 0;
        const completed = byVenue.get(source) ?? 0;
        return { source, shares, completed, rate: completed > 0 ? shares / completed : null };
      })
      .sort((a, b) => b.shares - a.shares || a.source.localeCompare(b.source));

    // Merge per-night confessions (from confession_counts) with per-night shares.
    type NightRow = { night: string; source: string; confessions: number; shares: number };
    const nightMap = new Map<string, NightRow>();
    for (const [k, e] of nightConf) {
      nightMap.set(k, { night: e.night, source: e.source, confessions: e.confessions, shares: 0 });
    }
    for (const row of rollup.nights ?? []) {
      if (row.source === "direct" || !row.night) continue;
      const k = `${row.night}|${row.source}`;
      const e = nightMap.get(k) ?? { night: row.night, source: row.source, confessions: 0, shares: 0 };
      e.shares += num(row.shares);
      nightMap.set(k, e);
    }
    const recentNights = new Set(
      [...new Set([...nightMap.values()].map((e) => e.night))].sort().reverse().slice(0, 30),
    );
    const nightRows = [...nightMap.values()]
      .filter((e) => recentNights.has(e.night))
      .sort(
        (a, b) =>
          (a.night < b.night ? 1 : a.night > b.night ? -1 : 0) ||
          b.confessions - a.confessions ||
          a.source.localeCompare(b.source),
      );

    return {
      totalAll,
      totalCompleted,
      byStatus,
      directCount: byVenue.get("direct") ?? 0,
      venueRows: [...byVenue].filter(([s]) => s !== "direct").sort(byCountDesc),
      topicRows: [...byTopic].sort(byCountDesc),
      venueTopicRows: [...byVenue]
        .filter(([s]) => s !== "direct")
        .sort(byCountDesc)
        .map(([v, count]) => ({
          venue: v,
          count,
          topics: [...(venueTopic.get(v) ?? new Map<string, number>())].sort(byCountDesc),
        })),
      scansAvailable: rollup.scans !== null,
      sharesAvailable: rollup.shares !== null,
      nightSharesAvailable: rollup.nights !== null,
      totalScans,
      totalShares,
      completionRows,
      shareRows,
      overallShareRate: totalCompleted > 0 ? totalShares / totalCompleted : null,
      nightRows,
    };
  }, [rollup]);

  // ── Actions ──
  const changeVenue = (v: string) => {
    setVenue(v);
    setPage(0);
  };
  const changeRange = (r: Range) => {
    setRange(r);
    setPage(0);
  };
  const changeTab = (next: Status) => {
    if (next === tab) return;
    setTab(next);
    setPage(0);
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

  // Undo → set the status back, then refetch (pagination makes local re-insertion unreliable).
  const undoStatus = async (row: Confession, originalStatus: Status) => {
    const { error } = await rpc("admin_set_status", { _id: row.id, _status: originalStatus });
    if (error) {
      toast({ title: "Undo failed", description: error.message, variant: "destructive" });
      return;
    }
    setRefreshTick((t) => t + 1);
    toast({ title: "Restored", description: `#${row.subject_number}` });
  };

  // Optimistically drop the row from the current page; on failure refetch to re-sync.
  const applyStatus = async (
    row: Confession,
    newStatus: Status,
    opts: { title: string; duration: number },
  ) => {
    const original = row.status as Status;
    setBusyId(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setTotalCount((c) => Math.max(0, c - 1));
    const { error } = await rpc("admin_set_status", { _id: row.id, _status: newStatus });
    setBusyId(null);
    if (error) {
      setRefreshTick((t) => t + 1);
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

  const copyNight = async (row: { night: string; source: string; confessions: number; shares: number }) => {
    const key = `${row.night}|${row.source}`;
    const name = venueDisplayName("", row.source) || row.source;
    const conf = `${row.confessions} ${row.confessions === 1 ? "confession" : "confessions"}`;
    const text = `${name} — ${formatNightLabel(row.night)}: ${conf}, ${row.shares} shared.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const copyReport = async () => {
    if (!report) return;
    const name = venueDisplayName("", report.source) || report.source;
    const span =
      report.first_night && report.last_night
        ? ` (${formatNightLabel(report.first_night)}–${formatNightLabel(report.last_night)})`
        : "";
    const cr = report.completion_rate == null ? null : num(report.completion_rate);
    const sr = report.share_rate == null ? null : num(report.share_rate);
    const topics = (report.top_topics ?? []).map((t) => `${topicLabel(t.topic)} (${t.n})`).join(", ");
    const text = [
      `${name} — ${RANGE_LABELS[range]}${span}`,
      `Scans: ${num(report.scans)} · Confessions: ${num(report.confessions)} (${fmtPct(cr)} completion)`,
      `Shares: ${num(report.shares)} (${fmtPct(sr)} share rate) · ${num(report.nights_active)} nights active`,
      topics ? `Top topics: ${topics}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  // ── Render states ──
  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <form onSubmit={sendLink} className="w-full max-w-sm space-y-4">
          <h1 className="text-lg font-semibold">CONSOLE</h1>
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const venueName = venue === "all" ? null : venueDisplayName("", venue) || venue;
  const reportCr = report && report.completion_rate != null ? num(report.completion_rate) : null;
  const reportSr = report && report.share_rate != null ? num(report.share_rate) : null;

  const StatBlock = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-wide">CONSOLE</h1>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>

        {/* Axes: date range (drives every RPC) + venue (primary). */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {(Object.keys(RANGE_NIGHTS) as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === range ? "secondary" : "ghost"}
                onClick={() => changeRange(r)}
              >
                {r === "all" ? "All" : `${r} nights`}
              </Button>
            ))}
          </div>
          <Select value={venue} onValueChange={changeVenue}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="All venues" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {VENUE_OPTIONS.map((v) => (
                <SelectItem key={v.slug} value={v.slug}>
                  {v.name} ({v.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── VENUE REPORT (single venue) — built to be screenshotted for the owner. ── */}
        {venue !== "all" ? (
          <section className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{venueName}</h2>
                <p className="text-xs text-muted-foreground">
                  {RANGE_LABELS[range]}
                  {report?.first_night && report?.last_night
                    ? ` · ${formatNightLabel(report.first_night)}–${formatNightLabel(report.last_night)}`
                    : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={copyReport} disabled={!report}>
                {reportCopied ? "Copied" : "Copy summary"}
              </Button>
            </div>

            {reportLoading ? (
              <p className="text-sm text-muted-foreground">Loading report…</p>
            ) : reportError ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Couldn't load this venue's report.</p>
                <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                  Retry
                </Button>
              </div>
            ) : report ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StatBlock label="Scans" value={num(report.scans)} />
                  <StatBlock label="Confessions" value={num(report.confessions)} />
                  <StatBlock label="Completion" value={fmtPct(reportCr)} />
                  <StatBlock label="Shares" value={num(report.shares)} />
                  <StatBlock label="Share rate" value={fmtPct(reportSr)} />
                  <StatBlock label="Nights active" value={num(report.nights_active)} />
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Top topics</p>
                  {report.top_topics && report.top_topics.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 text-xs">
                      {report.top_topics.map((t) => (
                        <li key={t.topic} className="rounded bg-muted px-2 py-1">
                          {topicLabel(t.topic)} <span className="text-muted-foreground">· {t.n}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No topics in range.</p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          /* ── ROLLUP (all venues) — cross-venue dashboard. ── */
          <section className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setRollupOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
            >
              <span>Rollup · {RANGE_LABELS[range]}</span>
              <span className="text-xs text-muted-foreground">{rollupOpen ? "Hide" : "Show"}</span>
            </button>

            {rollupOpen ? (
              <div className="space-y-5 border-t border-border px-4 py-4 text-xs">
                {rollupLoading ? (
                  <p className="text-muted-foreground">Loading rollup…</p>
                ) : rollupError ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">Couldn't load the rollup.</p>
                    <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                      Retry
                    </Button>
                  </div>
                ) : dash ? (
                  <>
                    <p className="text-muted-foreground">
                      Completed confessions across all venues, {RANGE_LABELS[range].toLowerCase()}.
                    </p>

                    {/* Totals */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">Totals</p>
                      <p>
                        Completed: <span className="font-semibold">{dash.totalCompleted}</span>{" "}
                        <span className="text-muted-foreground">of {dash.totalAll} total</span>
                      </p>
                      <p className="text-muted-foreground">
                        pending {dash.byStatus.pending} · approved {dash.byStatus.approved} · rejected{" "}
                        {dash.byStatus.rejected}
                      </p>
                    </div>

                    {/* By venue */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">By venue</p>
                      {dash.venueRows.length === 0 ? (
                        <p className="text-muted-foreground">No venue traffic in range.</p>
                      ) : (
                        <table className="w-full max-w-xs">
                          <tbody>
                            {dash.venueRows.map(([slug, n]) => (
                              <tr key={slug}>
                                <td className="py-0.5">{slug}</td>
                                <td className="py-0.5 text-right tabular-nums">{n}</td>
                              </tr>
                            ))}
                            <tr className="text-muted-foreground">
                              <td className="border-t border-border py-0.5">direct</td>
                              <td className="border-t border-border py-0.5 text-right tabular-nums">
                                {dash.directCount}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* By topic */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">By topic</p>
                      {dash.topicRows.length === 0 ? (
                        <p className="text-muted-foreground">No confessions in range.</p>
                      ) : (
                        <table className="w-full max-w-xs">
                          <tbody>
                            {dash.topicRows.map(([key, n]) => (
                              <tr key={key} className={key === "untagged" ? "text-muted-foreground" : ""}>
                                <td className="py-0.5">{topicLabel(key)}</td>
                                <td className="py-0.5 text-right tabular-nums">{n}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Scans & completion */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">Scans &amp; completion</p>
                      {!dash.scansAvailable ? (
                        <p className="text-muted-foreground">Scan counts unavailable.</p>
                      ) : dash.completionRows.length === 0 ? (
                        <p className="text-muted-foreground">No scans in range.</p>
                      ) : (
                        <>
                          <p className="mb-1 text-muted-foreground">
                            Total scans:{" "}
                            <span className="font-semibold text-foreground">{dash.totalScans}</span> · completion =
                            confessions ÷ scans.
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
                              {dash.completionRows.map(({ source, scans, confessions, rate }) => (
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

                    {/* Share rate */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">Share rate</p>
                      {!dash.sharesAvailable ? (
                        <p className="text-muted-foreground">Share counts unavailable.</p>
                      ) : (
                        <>
                          <p className="mb-1 text-muted-foreground">
                            Overall:{" "}
                            <span className="font-semibold text-foreground">{fmtPct(dash.overallShareRate)}</span> (
                            {dash.totalShares} taps ÷ {dash.totalCompleted} confessions · counts every tap)
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
                              {dash.shareRows.map(({ source, shares, completed, rate }) => (
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

                    {/* By night */}
                    <div>
                      <p className="mb-1 uppercase tracking-wide text-muted-foreground">By night</p>
                      {dash.nightRows.length === 0 ? (
                        <p className="text-muted-foreground">No venue nights in range.</p>
                      ) : (
                        <table className="w-full max-w-md">
                          <thead>
                            <tr className="text-muted-foreground">
                              <td className="py-0.5">night</td>
                              <td className="py-0.5">source</td>
                              <td className="py-0.5 text-right">conf.</td>
                              <td className="py-0.5 text-right">shares</td>
                              <td className="py-0.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {dash.nightRows.map((row) => {
                              const key = `${row.night}|${row.source}`;
                              return (
                                <tr key={key}>
                                  <td className="py-0.5 whitespace-nowrap">{formatNightLabel(row.night)}</td>
                                  <td className="py-0.5">{row.source}</td>
                                  <td className="py-0.5 text-right tabular-nums">{row.confessions}</td>
                                  <td className="py-0.5 text-right tabular-nums">{row.shares}</td>
                                  <td className="py-0.5 pl-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => copyNight(row)}
                                      className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                                    >
                                      {copiedKey === key ? "Copied" : "Copy"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Loading rollup…</p>
                )}
              </div>
            ) : null}
          </section>
        )}

        {/* ── CONFESSION LIST (server-side, paginated). Scanned for good ones, not cleared. ── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <p className="text-xs text-muted-foreground">
              {venue === "all" ? "all venues" : venue} · {totalCount} {tab}
            </p>
          </div>

          <Input
            type="search"
            placeholder="Search confession or verdict text…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />

          {/* Pager */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 0 || listLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1 || listLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>

          {listLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listError ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Couldn't load confessions.</p>
              <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {qDebounced.trim() ? "No matches." : `Nothing ${tab}.`}
            </p>
          ) : (
            <ul className="space-y-4">
              {rows.map((row) => {
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

                    <div className="flex gap-2">
                      {tab === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-ritual text-background hover:bg-ritual/90"
                            disabled={busyId === row.id}
                            onClick={() => applyStatus(row, "approved", { title: "Approved", duration: 9000 })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === row.id}
                            onClick={() => applyStatus(row, "rejected", { title: "Rejected", duration: 5000 })}
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
                            applyStatus(row, "rejected", { title: "Un-approved — off the wall", duration: 5000 })
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
                            applyStatus(row, "pending", { title: "Restored to pending", duration: 5000 })
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
      </div>
    </main>
  );
};

export default Moderate;
