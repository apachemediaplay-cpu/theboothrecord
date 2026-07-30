import { useState, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import QRCode from "qrcode";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import venuesData from "@/data/venues.json";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { venueDisplayName } from "@/lib/source";
import { fetchVenueRegister } from "@/lib/registers";
import { cn } from "@/lib/utils";

// `topic`/`is_test` are forward-only columns not in the generated types; the frontend
// only reads them (written server-side by generate-verdict / tag_confession).
type Confession = Database["public"]["Tables"]["confessions"]["Row"] & {
  topic: string | null;
  is_test: boolean | null;
  homepage_featured: boolean | null;
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

// public.venues row as read by the overview (not in the generated types — forward-only
// table, same situation as the admin_* RPCs).
type VenueAdminRow = {
  source: string;
  display_name: string;
  register: string | null;
  headline: string | null;
  guidance: string | null;
  active: boolean | null;
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

// Venue register (venues.register): which /confess placeholder set the venue shows.
// "default" is the UI stand-in for null (Radix Select can't hold an empty value);
// it maps back to null on write → the DTC set.
const REGISTER_OPTIONS = [
  { value: "default", label: "Default (DTC)" },
  { value: "social", label: "Social" },
  { value: "intimate", label: "Intimate" },
  { value: "edgy", label: "Edgy" },
] as const;
const registerLabel = (value: string) =>
  REGISTER_OPTIONS.find((o) => o.value === value)?.label ?? value;

// Slug rule for NEW venues: lowercase letters/digits/hyphens, no leading/trailing
// hyphen, 3–40 chars — the existing slug shape (seoultiger1988, frenchiecbda). The
// slug is permanent once a QR is printed, so this is enforced here AND in the
// admin_add_venue RPC; the client check is UX, the server check is authoritative.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const slugError = (slug: string, taken: boolean): string | null => {
  if (!slug) return "Slug is required.";
  if (slug.length < 3 || slug.length > 40 || !SLUG_RE.test(slug))
    return "Slug must be 3–40 characters: lowercase letters, numbers, hyphens — no spaces, no leading/trailing hyphen.";
  if (taken) return "That slug already exists — it would collide with a live venue.";
  return null;
};

// Canonical scan origin for venue QR codes. Deliberately NOT window.location.origin —
// a QR generated while the console runs on localhost must still point at production.
const BOOTH_ORIGIN = "https://theboothrecord.com";
// Physical-card URL shape: ?source= is the attribution slug, ?venue= the display name
// (printed cards ALWAYS carry ?venue= — isPhysicalScan() keys off it). Both values
// come straight from the DB row; display_name is read-only here.
const venueScanUrl = (source: string, displayName: string) =>
  `${BOOTH_ORIGIN}/?source=${encodeURIComponent(source)}&venue=${encodeURIComponent(displayName)}`;

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

// Copy-report date line: real dates, locale-stable (same approach as formatNightLabel).
// "1–30 July" within one month; month (and year, when they differ) spelled out otherwise.
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const fmtReportDay = (d: Date, withYear: boolean) =>
  `${d.getDate()} ${MONTHS_FULL[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
const fmtReportRange = (a: Date, b: Date) => {
  if (a.getFullYear() !== b.getFullYear()) return `${fmtReportDay(a, true)} – ${fmtReportDay(b, true)}`;
  if (a.getMonth() !== b.getMonth()) return `${fmtReportDay(a, false)} – ${fmtReportDay(b, false)}`;
  return `${a.getDate()}–${b.getDate()} ${MONTHS_FULL[a.getMonth()]}`;
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

// Ratio (0–1+) → whole-percent. For CLIENT-computed rates (confessions/scans etc.), which
// are fractions. null → em dash, never NaN.
const fmtPct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
// admin_venue_report already returns completion_rate/share_rate as WHOLE percents
// (SQL: round(100.0 * a / b, 1)), and null on divide-by-zero (scans=0 / confessions=0).
// So DON'T multiply — just append "%". null/non-numeric → "—" (never "0%"/"NaN%"). A real
// 0.0 (e.g. 0 confessions over some scans) is finite → renders "0%", as it should.
const fmtPctValue = (v: number | string | null | undefined) => {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n}%` : "—";
};
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

// One venue row in the overview. Module-level (NOT inside Moderate) so its identity is
// stable across parent re-renders — an inline definition would remount on every render
// and drop input focus mid-keystroke. Headline/subline are local DRAFTS committed by
// the Save button (dirty-gated); register/active write immediately. Saved values live
// in the parent's venuesRows — a failed write reverts props while the drafts survive,
// so the operator can retry without retyping.
const VenueOverviewRow = ({
  row,
  scans,
  completed,
  busy,
  expanded,
  onToggleExpand,
  onRegister,
  onActive,
  onSaveGreeting,
  onCopyReport,
  onDelete,
}: {
  row: VenueAdminRow;
  scans: number | null; // null = scan counts unavailable
  completed: number | null; // null = confession counts unavailable
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRegister: (value: string) => void;
  onActive: (next: boolean) => void;
  onSaveGreeting: (headline: string, guidance: string) => void;
  onCopyReport: () => Promise<void>;
  onDelete: () => void;
}) => {
  // Reentrancy guard for Copy report — the button is NEVER disabled (a venue with
  // no data still copies an honest report); in-flight clicks are just ignored.
  const [copying, setCopying] = useState(false);
  const [headline, setHeadline] = useState(row.headline ?? "");
  const [guidance, setGuidance] = useState(row.guidance ?? "");
  const dirty =
    headline.trim() !== (row.headline ?? "") || guidance.trim() !== (row.guidance ?? "");
  // Fail-safe: a missing/null status is treated as active — dimming is opt-in only.
  const active = row.active !== false;
  const completion = scans !== null && scans > 0 && completed !== null ? completed / scans : null;

  // Venue QR: generated lazily on first open, cached for the row's lifetime. Black
  // modules on white stay hardcoded by design — a QR is artifact content whose
  // scannability requires dark-on-light, not themed UI.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const scanUrl = venueScanUrl(row.source, row.display_name);
  const toggleQr = () => {
    const opening = !qrOpen;
    setQrOpen(opening);
    if (opening && !qrDataUrl) {
      QRCode.toDataURL(scanUrl, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrError(true));
    }
  };
  return (
    <li className={cn("py-4", !active && "opacity-50")}>
      {/* Collapsed row: chevron + name + slug + muted register·scans·completion, with
          the active toggle on the right. The whole row toggles expand EXCEPT the
          toggle — flipping active/inactive must never require expanding. */}
      <div
        className="flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-1"
        onClick={onToggleExpand}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">{row.display_name}</span>
        <SourceBadge source={row.source} />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {registerLabel(row.register ?? "default")} · scans {scans === null ? "—" : scans} ·{" "}
          completion {fmtPct(completion)}
        </span>
        <label className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {active ? "Active" : "Inactive"}
          </span>
          <Switch checked={active} onCheckedChange={onActive} disabled={busy} />
        </label>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-5 pb-2 pl-7">
          <Field label="Register">
            <Select value={row.register ?? "default"} onValueChange={onRegister} disabled={busy}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGISTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {/* Full-width greeting inputs — the whole line must be readable, never
              truncated (the old inline flex-1 layout clipped long headlines). */}
          <Field label="Headline (blank → default prompt)">
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Confess something."
              className="h-8 w-full text-xs"
            />
          </Field>
          <Field label="Subline (optional)">
            <Input
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              className="h-8 w-full text-xs"
            />
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={!dirty || busy}
              onClick={() => onSaveGreeting(headline, guidance)}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleQr}>
              {qrOpen ? "Hide QR" : "QR"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (copying) return;
                setCopying(true);
                onCopyReport().finally(() => setCopying(false));
              }}
            >
              {copying ? "Copying…" : "Copy report"}
            </Button>
            {/* Delete — the console's ONE destructive action: recessive red text on the
                far right, gated behind its confirm dialog. Mistakes/test venues only;
                real venues get the collapsed-row active toggle. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="ml-auto text-[11px] text-destructive/80 underline underline-offset-2 hover:text-destructive transition-colors"
                >
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {row.display_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. Real venues should be deactivated, not deleted —
                    delete is only for mistakes and test venues. A venue with real
                    confessions will refuse to delete.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                  >
                    Delete {row.source}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {qrOpen ? (
            <div className="flex flex-wrap items-start gap-3 pt-1">
              {qrError ? (
                <p className="text-xs text-muted-foreground">Couldn't generate the QR.</p>
              ) : qrDataUrl ? (
                <>
                  <img
                    src={qrDataUrl}
                    alt={`Scan QR for ${row.display_name}`}
                    className="h-36 w-36 rounded"
                  />
                  <div className="space-y-2 text-[11px] text-muted-foreground">
                    <p className="max-w-64 break-all">{scanUrl}</p>
                    <Button size="sm" variant="outline" asChild>
                      <a href={qrDataUrl} download={`booth-qr-${row.source}.png`}>
                        Download PNG
                      </a>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Generating…</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

// Labelled field for AddVenueForm. Module-level so its identity is stable — defined
// inside the form it would remount its Input child (and drop focus) on every keystroke.
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    {children}
  </label>
);

// Add-venue form. Module-level for the same reason as VenueOverviewRow (stable
// identity across parent re-renders). Validation runs BEFORE the write: slug shape +
// duplicate check against the loaded table (server re-checks both — this is UX, the
// RPC is the gate). The slug input lowercases as you type so what you see is exactly
// what the QR will carry.
const AddVenueForm = ({
  takenSlugs,
  onAdd,
  onClose,
}: {
  takenSlugs: Set<string>;
  onAdd: (v: {
    source: string;
    displayName: string;
    register: string | null;
    headline: string;
    guidance: string;
    active: boolean;
  }) => Promise<boolean>;
  onClose: () => void;
}) => {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [register, setRegister] = useState("default");
  const [headline, setHeadline] = useState("");
  const [guidance, setGuidance] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const s = slug.trim();
    const n = name.trim();
    const err = slugError(s, takenSlugs.has(s)) ?? (n ? null : "Display name is required.");
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    const ok = await onAdd({
      source: s,
      displayName: n,
      register: register === "default" ? null : register,
      headline,
      guidance,
      active,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="my-2 space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">Add venue</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Slug — permanent, becomes the QR URL">
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setError(null);
            }}
            placeholder="e.g. highballcbr"
            className="h-8 text-xs"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Display name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Highball"
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Register">
          <Select value={register} onValueChange={setRegister}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGISTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <span className="flex h-8 items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
          </span>
        </Field>
        <Field label="Headline (blank → default prompt)">
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Confess something."
            className="h-8 text-xs"
          />
        </Field>
        <Field label="Subline (optional)">
          <Input
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder=""
            className="h-8 text-xs"
          />
        </Field>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={submit}>
          {saving ? "Adding…" : "Add venue"}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

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

  // Top-level console tab. Persisted to sessionStorage so returning within the
  // session lands on the last-used tab; a fresh session defaults to Moderate.
  type ConsoleTab = "moderate" | "venues" | "stats";
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>(() => {
    const s = sessionStorage.getItem("booth-console-tab");
    return s === "venues" || s === "stats" ? s : "moderate";
  });
  const changeConsoleTab = (t: ConsoleTab) => {
    setConsoleTab(t);
    sessionStorage.setItem("booth-console-tab", t);
  };

  // Pending count for the Moderate tab label. Tracks the persistent filters
  // (venue, range) — not the queue's sub-tab or search.
  const [pendingCount, setPendingCount] = useState<number | null>(null);

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

  // Queue redesign state. qTopic filters CLIENT-SIDE on top of the server filters
  // (the list RPC has no topic param and RPCs are off-limits here); selection spans
  // pages ("select all matching" fetches every matching page); focusIdx drives the
  // keyboard A/R/F target; confirmBulk holds the pending bulk action awaiting its
  // confirmation dialog.
  const [qTopic, setQTopic] = useState<string>("all");
  const [selected, setSelected] = useState<Map<string, Confession>>(new Map());
  const [allMatching, setAllMatching] = useState<Confession[] | null>(null);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [matchingCapped, setMatchingCapped] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [confirmBulk, setConfirmBulk] = useState<{ status: Status; label: string } | null>(null);

  // Cross-venue rollup (venue === "all"). Stats-tab disclosure toggles: full topic
  // list, zero-confession sources, and the nightly table (all default collapsed).
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [zeroOpen, setZeroOpen] = useState(false);
  const [nightTableOpen, setNightTableOpen] = useState(false);
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

  // Register picker (venue !== "all"). null = default/DTC. Ready gates the Select so a
  // slow read can't briefly show "Default (DTC)" for a venue that has a register set.
  const [register, setRegister] = useState<string | null>(null);
  const [registerReady, setRegisterReady] = useState(false);
  const [registerSaving, setRegisterSaving] = useState(false);

  // Venues overview: every venue as an editable row, independent of the venue axis.
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [venuesRows, setVenuesRows] = useState<VenueAdminRow[] | null>(null);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [venuesError, setVenuesError] = useState(false);
  // null map = that stat's RPC failed → the column renders "—", never 0.
  const [venueStats, setVenueStats] = useState<{
    scans: Map<string, number> | null;
    completed: Map<string, number> | null;
  } | null>(null);
  const [venueBusy, setVenueBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Single expand: at most one venue row open; opening another closes the last.
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const takenSlugs = useMemo(
    () => new Set((venuesRows ?? []).map((r) => r.source)),
    [venuesRows],
  );
  // Active venues first, inactive (dimmed) at the bottom; alphabetical within each
  // group. Missing/null active counts as active (same fail-safe as the row).
  const sortedVenueRows = useMemo(
    () =>
      venuesRows
        ? [...venuesRows].sort(
            (a, b) =>
              (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0) ||
              a.display_name.localeCompare(b.display_name) ||
              a.source.localeCompare(b.source),
          )
        : null,
    [venuesRows],
  );

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

  // ── Pending count for the Moderate tab label ──
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    safe(
      rpc("admin_list_confessions_count", {
        _status: "pending",
        _source: venue === "all" ? null : venue,
        _q: null,
        ...rangeArgs,
      }),
    ).then((res) => {
      if (cancelled || res.error) return;
      setPendingCount(num(res.data as number));
    });
    return () => {
      cancelled = true;
    };
  }, [session, venue, rangeArgs, refreshTick]);

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

  // ── Venue register (only when a venue is selected) ──
  // Read via the same public-read path the confess screen uses; a failed read resolves
  // null → shows Default. Writes below go through the admin RPC.
  useEffect(() => {
    if (!session || venue === "all") return;
    let cancelled = false;
    setRegisterReady(false);
    fetchVenueRegister(venue).then((r) => {
      if (cancelled) return;
      setRegister(r);
      setRegisterReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session, venue]);

  // ── Venues overview: all venues + range-scoped scans/completion ──
  // The venues read uses the table's public-read policy (same path as the confess
  // screen); stats reuse the admin scan/confession RPCs. A failed stats fetch degrades
  // that column to "—" — only a failed venues read fails the table itself.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setVenuesLoading(true);
    setVenuesError(false);
    const from = sb.from.bind(sb) as unknown as (table: string) => {
      select(cols: string): PromiseLike<{ data: VenueAdminRow[] | null; error: unknown }>;
    };
    Promise.all([
      Promise.resolve(
        from("venues").select("source,display_name,register,headline,guidance,active"),
      ).then(
        (r) => r,
        () => ({ data: null, error: { message: "request failed" } }),
      ),
      safe(rpc("admin_scan_counts", rangeArgs)),
      safe(rpc("admin_confession_counts", rangeArgs)),
    ]).then(([v, scans, conf]) => {
      if (cancelled) return;
      setVenuesLoading(false);
      if (v.error || !v.data) {
        setVenuesError(true);
        setVenuesRows(null);
        return;
      }
      setVenuesRows(
        [...v.data].sort(
          (a, b) => a.display_name.localeCompare(b.display_name) || a.source.localeCompare(b.source),
        ),
      );
      const completed = new Map<string, number>();
      if (!conf.error) {
        for (const r of (conf.data as ConfCount[]) ?? []) {
          completed.set(r.source, (completed.get(r.source) ?? 0) + num(r.completed));
        }
      }
      setVenueStats({
        scans: scans.error
          ? null
          : new Map(((scans.data as ScanCount[]) ?? []).map((r) => [r.source, num(r.scans)])),
        completed: conf.error ? null : completed,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session, rangeArgs, refreshTick]);

  // ── Queue: derived rows, selection lifecycle, full-filter fetch ──
  // Topic filter is client-side (the list RPC has no topic param): the visible list is
  // the current page minus non-matching topics. "untagged" matches topic null.
  const visibleRows = useMemo(
    () => (qTopic === "all" ? rows : rows.filter((r) => (r.topic ?? "untagged") === qTopic)),
    [rows, qTopic],
  );

  // Any filter/tab/search change invalidates the selection and the fetched
  // matching set — a selection must never silently survive a filter change.
  // (Page changes deliberately do NOT clear: "select all matching" spans pages.)
  useEffect(() => {
    setSelected(new Map());
    setAllMatching(null);
    setMatchingCapped(false);
  }, [tab, venue, qDebounced, rangeArgs, qTopic]);

  // Keep keyboard focus in range as rows appear/disappear, reset on page flips.
  useEffect(() => {
    setFocusIdx((i) => Math.max(0, Math.min(i, visibleRows.length - 1)));
  }, [visibleRows.length]);
  useEffect(() => {
    setFocusIdx(0);
  }, [page, tab]);

  // Fetch EVERY row matching the current server filters (same list RPC, page loop),
  // then apply the client topic filter. Powers the real M in "Select all M matching"
  // and the cross-page selection itself. Hard cap 2000 rows — surfaced via
  // matchingCapped, never silent.
  const MATCHING_CAP = 2000;
  const fetchAllMatching = async (): Promise<Confession[] | null> => {
    setMatchingLoading(true);
    const filters = {
      _status: tab,
      _source: venue === "all" ? null : venue,
      _q: qDebounced.trim() || null,
      ...rangeArgs,
    };
    const out: Confession[] = [];
    let offset = 0;
    let capped = false;
    for (;;) {
      const { data, error } = await safe(
        rpc("admin_list_confessions", { ...filters, _limit: PAGE_SIZE, _offset: offset }),
      );
      if (error) {
        setMatchingLoading(false);
        return null;
      }
      const batch = (data as Confession[]) ?? [];
      out.push(...batch);
      offset += batch.length;
      if (batch.length < PAGE_SIZE) break;
      if (out.length >= MATCHING_CAP) {
        capped = true;
        break;
      }
    }
    const filtered = qTopic === "all" ? out : out.filter((r) => (r.topic ?? "untagged") === qTopic);
    setAllMatching(filtered);
    setMatchingCapped(capped);
    setMatchingLoading(false);
    return filtered;
  };

  // With a topic filter active the server count can't provide M, so resolve the real
  // count in the background as soon as the filter lands (and after any refetch).
  useEffect(() => {
    if (!session || qTopic === "all") return;
    fetchAllMatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, qTopic, tab, venue, qDebounced, rangeArgs, refreshTick]);

  // The real total matching the current filter: exact server count when no topic
  // filter; the fetched set's length otherwise (null until it resolves).
  const matchingTotal = qTopic === "all" ? totalCount : (allMatching?.length ?? null);

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

    // Unified per-source join for the Stats "BY SOURCE" table: scans ∪ confessions ∪
    // share taps on the common source key. A failed scans/shares RPC yields null for
    // that column ("—"), never a fake 0. direct is kept separate — always rendered
    // last, labelled as the operator's own traffic.
    const allSources = new Set([...scanMap.keys(), ...shareMap.keys(), ...byVenue.keys()]);
    allSources.delete("direct");
    const sourceRows = [...allSources]
      .map((source) => ({
        source,
        scans: rollup.scans === null ? null : (scanMap.get(source) ?? 0),
        conf: byVenue.get(source) ?? 0,
        taps: rollup.shares === null ? null : (shareMap.get(source) ?? 0),
      }))
      .sort((a, b) => b.conf - a.conf || a.source.localeCompare(b.source));
    const directRow = {
      source: "direct",
      scans: rollup.scans === null ? null : (scanMap.get("direct") ?? 0),
      conf: byVenue.get("direct") ?? 0,
      taps: rollup.shares === null ? null : (shareMap.get("direct") ?? 0),
    };

    return {
      totalAll,
      totalCompleted,
      byStatus,
      sourceRows,
      directRow,
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

  // Bars for the Stats BY NIGHT strip — derived from dash.nightRows only (no fetch).
  // For a bounded range (7/30) every night bucket in the window renders, using the
  // same 4am shift as nightBucketFrom; for "all", every night between the earliest
  // and latest data night (nightRows caps at the most recent 30, so the span does
  // too). Empty nights always render with conf 0 — bars must represent real time.
  const nightBars = useMemo(() => {
    if (!dash) return null;
    const totals = new Map<string, number>();
    for (const r of dash.nightRows) totals.set(r.night, (totals.get(r.night) ?? 0) + r.confessions);
    let nights: string[];
    const span = RANGE_NIGHTS[range];
    if (Number.isFinite(span)) {
      nights = [];
      const d = new Date();
      d.setHours(d.getHours() - 4);
      for (let i = span - 1; i >= 0; i--) {
        const dd = new Date(d);
        dd.setDate(d.getDate() - i);
        nights.push(fmtYmd(dd));
      }
    } else {
      // "All": fill EVERY night between the earliest and latest data night — sparse
      // bars evenly spaced would misrepresent time (13 Jul next to 28 Jul).
      const present = [...totals.keys()].sort();
      nights = [];
      if (present.length) {
        const end = new Date(`${present[present.length - 1]}T00:00:00`);
        for (
          const d = new Date(`${present[0]}T00:00:00`);
          d <= end;
          d.setDate(d.getDate() + 1)
        ) {
          nights.push(fmtYmd(d));
        }
      }
    }
    return nights.map((night) => ({ night, conf: totals.get(night) ?? 0 }));
  }, [dash, range]);

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

  // ── Queue decisions: ONE path for single buttons, keyboard, and bulk. ──
  // Same admin_set_status RPC the single buttons always used — no parallel path.
  // Optimistic: rows leave the page (and the selection) immediately; failures
  // refetch and surface a count. Every decision gets a ~4s Undo toast — that is
  // what makes keyboard auto-advance and bulk safe.
  const setStatusChunked = async (targets: Confession[], status: Status) => {
    const results: { t: Confession; error: { message: string } | null }[] = [];
    for (let i = 0; i < targets.length; i += 10) {
      const chunk = targets.slice(i, i + 10);
      results.push(
        ...(await Promise.all(
          chunk.map((t) =>
            safe(rpc("admin_set_status", { _id: t.id, _status: status })).then((r) => ({
              t,
              error: r.error,
            })),
          ),
        )),
      );
    }
    return results;
  };

  // Toast title per transition — matches the old per-tab button copy.
  const decisionLabel = (newStatus: Status) =>
    newStatus === "approved" ? "Approved" : newStatus === "pending" ? "Restored to pending" : tab === "approved" ? "Un-approved" : "Rejected";

  const undoMany = async (targets: Confession[], originalStatus: Status) => {
    const results = await setStatusChunked(targets, originalStatus);
    const failed = results.filter((r) => r.error).length;
    setRefreshTick((t) => t + 1);
    if (failed) {
      toast({
        title: `Undo failed for ${failed} of ${targets.length}`,
        description: results.find((r) => r.error)?.error?.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Restored ${targets.length === 1 ? `#${targets[0].subject_number}` : targets.length}` });
  };

  const decide = async (targets: Confession[], newStatus: Status) => {
    if (!targets.length || bulkBusy) return;
    const original = targets[0].status as Status;
    const ids = new Set(targets.map((t) => t.id));
    setBulkBusy(true);
    setRows((prev) => prev.filter((r) => !ids.has(r.id)));
    setTotalCount((c) => Math.max(0, c - targets.length));
    setSelected((prev) => {
      if (!prev.size) return prev;
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setAllMatching((prev) => (prev ? prev.filter((r) => !ids.has(r.id)) : prev));
    // Keep the Moderate tab's pending badge honest without a refetch.
    if (original === "pending")
      setPendingCount((c) => (c === null ? c : Math.max(0, c - targets.length)));
    else if (newStatus === "pending")
      setPendingCount((c) => (c === null ? c : c + targets.length));
    const results = await setStatusChunked(targets, newStatus);
    setBulkBusy(false);
    const failed = results.filter((r) => r.error);
    const succeeded = results.filter((r) => !r.error).map((r) => r.t);
    if (failed.length) {
      setRefreshTick((t) => t + 1);
      toast({
        title: `${failed.length} of ${targets.length} failed`,
        description: failed[0].error?.message,
        variant: "destructive",
      });
      if (!succeeded.length) return;
    }
    toast({
      title: `${decisionLabel(newStatus)} · ${
        succeeded.length === 1 ? `#${succeeded[0].subject_number}` : succeeded.length
      }`,
      duration: 4000,
      action: (
        <ToastAction altText="Undo" onClick={() => undoMany(succeeded, original)}>
          Undo
        </ToastAction>
      ),
    });
  };

  // Select every row matching the current filter, across ALL pages — the deliberate
  // second step after page-level selection. Reuses the fetched set when available.
  const selectAllMatching = async () => {
    const all = allMatching ?? (await fetchAllMatching());
    if (!all) {
      toast({ title: "Couldn't load matching rows", variant: "destructive" });
      return;
    }
    setSelected(new Map(all.map((r) => [r.id, r])));
  };

  // Feature/unfeature on the homepage. Keeps the row in place (unlike status changes);
  // optimistic flip, reverted on failure. Same admin gate as approve/reject (is_admin()).
  const toggleFeatured = async (row: Confession) => {
    const next = !row.homepage_featured;
    setBusyId(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, homepage_featured: next } : r)));
    const { error } = await rpc("set_homepage_featured", { target_id: row.id, value: next });
    setBusyId(null);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, homepage_featured: !next } : r)));
      toast({ title: "Couldn't update feature", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Featured on homepage" : "Removed from homepage",
      description: `#${row.subject_number}`,
    });
  };

  // Optimistic register change; reverted on failure (same pattern as toggleFeatured).
  const changeRegister = async (value: string) => {
    const next = value === "default" ? null : value;
    const prev = register;
    if (next === prev) return;
    setRegister(next);
    setRegisterSaving(true);
    const { error } = await rpc("admin_set_venue_register", { _source: venue, _register: next });
    setRegisterSaving(false);
    if (error) {
      setRegister(prev);
      toast({ title: "Couldn't update register", description: error.message, variant: "destructive" });
      return;
    }
    patchVenueRow(venue, { register: next }); // keep the overview row in sync
    toast({
      title: "Register updated",
      description: `${venueDisplayName("", venue) || venue} → ${registerLabel(value)}`,
    });
  };

  // ── Venues overview writes: optimistic update + revert-on-failure + toast, the
  // same pattern as changeRegister/toggleFeatured. One in-flight write per row. ──
  const patchVenueRow = (source: string, patch: Partial<VenueAdminRow>) =>
    setVenuesRows((prev) => prev?.map((r) => (r.source === source ? { ...r, ...patch } : r)) ?? prev);

  const overviewSetRegister = async (source: string, value: string) => {
    const next = value === "default" ? null : value;
    const prev = venuesRows?.find((r) => r.source === source)?.register ?? null;
    if (next === prev) return;
    setVenueBusy(source);
    patchVenueRow(source, { register: next });
    const { error } = await rpc("admin_set_venue_register", { _source: source, _register: next });
    setVenueBusy(null);
    if (error) {
      patchVenueRow(source, { register: prev });
      toast({ title: "Couldn't update register", description: error.message, variant: "destructive" });
      return;
    }
    if (venue === source) setRegister(next); // keep the report-card dropdown in sync
    toast({
      title: "Register updated",
      description: `${venueDisplayName("", source) || source} → ${registerLabel(value)}`,
    });
  };

  const overviewSetActive = async (source: string, nextActive: boolean) => {
    const prev = venuesRows?.find((r) => r.source === source)?.active !== false;
    if (nextActive === prev) return;
    setVenueBusy(source);
    patchVenueRow(source, { active: nextActive });
    const { error } = await rpc("admin_set_venue_active", { _source: source, _active: nextActive });
    setVenueBusy(null);
    if (error) {
      patchVenueRow(source, { active: prev });
      toast({ title: "Couldn't update status", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: nextActive ? "Venue active" : "Venue inactive",
      description: venueDisplayName("", source) || source,
    });
  };

  const overviewSaveGreeting = async (source: string, headline: string, guidance: string) => {
    const row = venuesRows?.find((r) => r.source === source);
    if (!row) return;
    // Blank → null, matching the RPC's own nullif(trim(...)) — so the optimistic
    // value equals what the server will store and the confess screen falls back to
    // the default prompt.
    const nextHeadline = headline.trim() || null;
    const nextGuidance = guidance.trim() || null;
    const prev = { headline: row.headline, guidance: row.guidance };
    setVenueBusy(source);
    patchVenueRow(source, { headline: nextHeadline, guidance: nextGuidance });
    const { error } = await rpc("admin_set_venue_greeting", {
      _source: source,
      _headline: nextHeadline,
      _guidance: nextGuidance,
    });
    setVenueBusy(null);
    if (error) {
      patchVenueRow(source, prev);
      toast({ title: "Couldn't update greeting", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Greeting updated",
      description: `${venueDisplayName("", source) || source} → ${nextHeadline ?? "default prompt"}`,
    });
  };

  // Delete a venue via admin_delete_venue. NOT optimistic — the destructive action
  // removes the row only after the server confirms. The RPC refuses venues with real
  // (non-test) confessions; that error surfaces in the toast and the row stays.
  const deleteVenue = async (source: string, displayName: string) => {
    setVenueBusy(source);
    const { error } = await rpc("admin_delete_venue", { _source: source });
    setVenueBusy(null);
    if (error) {
      toast({ title: "Can't delete", description: error.message, variant: "destructive" });
      return;
    }
    setVenuesRows((prev) => prev?.filter((r) => r.source !== source) ?? prev);
    toast({ title: "Venue deleted", description: `${displayName} (${source})` });
  };

  // "Copy report" (Venues tab): ONE page-loop of admin_list_confessions with
  // _status: null (all statuses) for the venue in the ACTIVE window. Filtering is
  // all server-side (_source / _from / _to / _tz / _include_test: false); the client
  // only splits by status, counts, and formats — never re-filters what the RPC
  // filtered. 200/page (server cap), loop until a short page; 4000-row backstop.
  const fetchVenueReportRows = async (source: string): Promise<Confession[] | null> => {
    const out: Confession[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await safe(
        rpc("admin_list_confessions", {
          _status: null,
          _source: source,
          ...rangeArgs,
          _include_test: false,
          _limit: 200,
          _offset: offset,
        }),
      );
      if (error) return null;
      const batch = (data as Confession[]) ?? [];
      out.push(...batch);
      offset += batch.length;
      if (batch.length < 200 || offset >= 4000) break;
    }
    return out; // RPC order: created_at desc
  };

  // Date line for the report: the active window's real endpoints for 7/30 (the same
  // _from the RPC was given, through tonight's bucket); for All time, the span of
  // the returned rows. Zero rows on All time → "All time".
  const reportDateLine = (rows: Confession[]): string => {
    if (fromDate) {
      const a = new Date(`${fromDate}T00:00:00`);
      const b = new Date();
      b.setHours(b.getHours() - 4);
      return fmtReportRange(a, b);
    }
    if (!rows.length) return "All time";
    const times = rows.map((r) => new Date(r.created_at).getTime());
    return fmtReportRange(new Date(Math.min(...times)), new Date(Math.max(...times)));
  };

  // Build the venue's plain-text report and copy it. Starts mid-flow (pasted into a
  // personal email — no title line). N counts pending + approved only: material we
  // refused to publish is not "guests confessed". No taps, no rates, no percentages.
  const copyVenueReport = async (source: string, displayName: string) => {
    const rows = await fetchVenueReportRows(source);
    if (!rows) {
      toast({
        title: "Couldn't build report",
        description: "Loading confessions failed.",
        variant: "destructive",
      });
      return;
    }
    const n = rows.filter((r) => r.status === "pending" || r.status === "approved").length;
    const approved = rows.filter((r) => r.status === "approved").slice(0, 3); // order kept: created_at desc
    const HEADINGS = ["One", "Two", "Three"];
    const block =
      approved.length === 0
        ? "No confessions cleared for sharing yet."
        : [
            `${HEADINGS[approved.length - 1]} from this month — post any of them you like:`,
            ...approved.map((r) => `"${r.confession_text}"\ntheboothrecord.com/og/${r.id}.png`),
          ].join("\n\n");
    const text = [
      "The Booth is a QR card on your tables. Guests confess something, get a verdict back, and can share it with your name on it.",
      reportDateLine(rows),
      `${n} guests confessed`,
      block,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast({
        title: "Couldn't copy report",
        description: "Clipboard blocked.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Report copied", description: `${displayName} (${source})` });
  };

  // Create a venue via admin_add_venue (server re-validates slug shape, duplicates,
  // register, and the is_admin() gate). Not optimistic — the row only enters the
  // overview once the server has returned it, so what's shown is what's stored.
  const addVenue = async (v: {
    source: string;
    displayName: string;
    register: string | null;
    headline: string;
    guidance: string;
    active: boolean;
  }): Promise<boolean> => {
    const { data, error } = await rpc("admin_add_venue", {
      _source: v.source,
      _display_name: v.displayName,
      _register: v.register,
      _headline: v.headline.trim() || null,
      _guidance: v.guidance.trim() || null,
      _active: v.active,
    });
    if (error) {
      toast({ title: "Couldn't add venue", description: error.message, variant: "destructive" });
      return false;
    }
    const row = (Array.isArray(data) ? data[0] : data) as VenueAdminRow | undefined;
    if (!row?.source) {
      setRefreshTick((t) => t + 1); // unexpected shape — refetch rather than guess
      return true;
    }
    setVenuesRows((prev) =>
      [...(prev ?? []), row].sort(
        (a, b) => a.display_name.localeCompare(b.display_name) || a.source.localeCompare(b.source),
      ),
    );
    toast({ title: "Venue added", description: `${row.display_name} (${row.source})` });
    return true;
  };

  // Keyboard on the focused card: A approve (pending tab), R reject/un-approve,
  // F feature, ↑/↓ (or j/k) move focus. Decisions auto-advance because the acted
  // row leaves the list and the next one inherits its index. Ignored while typing
  // in a field, while a dialog is open (confirmBulk), mid-bulk — and on any
  // console tab other than Moderate (the queue may not even be rendered).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (consoleTab !== "moderate") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable ||
          el.closest('[role="dialog"]'))
      )
        return;
      if (confirmBulk || !visibleRows.length) return;
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, visibleRows.length - 1));
        return;
      }
      if (k === "arrowup" || k === "k") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
        return;
      }
      const row = visibleRows[Math.min(focusIdx, visibleRows.length - 1)];
      if (!row || bulkBusy) return;
      if (k === "a" && tab === "pending") decide([row], "approved");
      else if (k === "r" && tab !== "rejected") decide([row], "rejected");
      else if (k === "f") toggleFeatured(row);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    const topics = (report.top_topics ?? []).map((t) => `${topicLabel(t.topic)} (${t.n})`).join(", ");
    const text = [
      `${name} — ${RANGE_LABELS[range]}${span}`,
      `Scans: ${num(report.scans)} · Confessions: ${num(report.confessions)} (${fmtPctValue(report.completion_rate)} completion)`,
      `Shares: ${num(report.shares)} (${fmtPctValue(report.share_rate)} share rate) · ${num(report.nights_active)} nights active`,
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

        {/* Persistent filter bar: date range (applies on every tab) + venue (applies to
            Moderate + Stats; DISABLED — visibly, not silently ignored — on the Venues
            tab, where managing all venues makes it inapplicable). State survives tab
            switches. */}
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
          <Select value={venue} onValueChange={changeVenue} disabled={consoleTab === "venues"}>
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

        {/* Top-level console tabs. Only the active tab's content renders below. */}
        <div className="flex gap-1 border-b border-border pb-2">
          <Button
            size="sm"
            variant={consoleTab === "moderate" ? "secondary" : "ghost"}
            onClick={() => changeConsoleTab("moderate")}
          >
            Moderate{pendingCount !== null ? ` · ${pendingCount}` : ""}
          </Button>
          <Button
            size="sm"
            variant={consoleTab === "venues" ? "secondary" : "ghost"}
            onClick={() => changeConsoleTab("venues")}
          >
            Venues{venuesRows ? ` · ${venuesRows.length}` : ""}
          </Button>
          <Button
            size="sm"
            variant={consoleTab === "stats" ? "secondary" : "ghost"}
            onClick={() => changeConsoleTab("stats")}
          >
            Stats
          </Button>
        </div>

        {/* ── VENUES TAB — every venue as a row: register, greeting, status. ── */}
        {consoleTab === "venues" ? (
        <section className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setOverviewOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
          >
            <span>Venues{venuesRows ? ` · ${venuesRows.length}` : ""}</span>
            <span className="text-xs text-muted-foreground">{overviewOpen ? "Hide" : "Show"}</span>
          </button>
          {overviewOpen ? (
            <div className="border-t border-border px-4 pb-2">
              {venuesLoading ? (
                <p className="py-3 text-sm text-muted-foreground">Loading venues…</p>
              ) : venuesError ? (
                <div className="space-y-2 py-3">
                  <p className="text-sm text-muted-foreground">Couldn't load venues.</p>
                  <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                    Retry
                  </Button>
                </div>
              ) : venuesRows && venuesRows.length > 0 ? (
                <>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Scans &amp; completion: {RANGE_LABELS[range].toLowerCase()}. Blank headline →
                    default prompt.
                  </p>
                  <ul className="divide-y divide-border">
                    {(sortedVenueRows ?? []).map((row) => (
                      <VenueOverviewRow
                        key={row.source}
                        row={row}
                        scans={venueStats?.scans ? (venueStats.scans.get(row.source) ?? 0) : null}
                        completed={
                          venueStats?.completed ? (venueStats.completed.get(row.source) ?? 0) : null
                        }
                        busy={venueBusy === row.source}
                        expanded={expandedVenue === row.source}
                        onToggleExpand={() =>
                          setExpandedVenue((cur) => (cur === row.source ? null : row.source))
                        }
                        onRegister={(v) => overviewSetRegister(row.source, v)}
                        onActive={(next) => overviewSetActive(row.source, next)}
                        onSaveGreeting={(h, g) => overviewSaveGreeting(row.source, h, g)}
                        onCopyReport={() => copyVenueReport(row.source, row.display_name)}
                        onDelete={() => deleteVenue(row.source, row.display_name)}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">No venues.</p>
              )}
              {!venuesLoading && !venuesError ? (
                addOpen ? (
                  <AddVenueForm
                    takenSlugs={takenSlugs}
                    onAdd={addVenue}
                    onClose={() => setAddOpen(false)}
                  />
                ) : (
                  <div className="py-2">
                    <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                      Add venue
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </section>
        ) : null}

        {/* ── STATS TAB — the venue report (venue selected) or the cross-venue rollup. ── */}
        {consoleTab === "stats" ? (
        venue !== "all" ? (
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

            {/* Confess register: which placeholder set this venue's /confess rotates. */}
            <div className="flex items-center gap-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Confess register
              </p>
              {registerReady ? (
                <Select
                  value={register ?? "default"}
                  onValueChange={changeRegister}
                  disabled={registerSaving}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">Loading…</p>
              )}
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
                  <StatBlock label="Completion" value={fmtPctValue(report.completion_rate)} />
                  <StatBlock label="Shares" value={num(report.shares)} />
                  <StatBlock label="Share rate" value={fmtPctValue(report.share_rate)} />
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
          /* ── ROLLUP (all venues) — flat Stats-tab render; the filter chips above
             the tabs already state the window. ── */
          <div className="text-xs">
            {rollupLoading ? (
              <p className="text-sm text-muted-foreground">Loading stats…</p>
            ) : rollupError ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Couldn't load stats.</p>
                <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                  Retry
                </Button>
              </div>
            ) : dash ? (
              <>
                {/* Summary strip: hairline dividers via gap-px on a border background. */}
                <div className="mb-[18px] grid grid-cols-2 gap-px bg-border min-[480px]:grid-cols-4">
                  {/* Funnel order: scanned → confessed → shared → published. */}
                  {[
                    { label: "Scans", value: dash.scansAvailable ? dash.totalScans : "—" },
                    { label: "Confessions", value: dash.totalCompleted },
                    { label: "Share taps", value: dash.sharesAvailable ? dash.totalShares : "—" },
                    { label: "On the wall", value: dash.byStatus.approved },
                  ].map((cell) => (
                    <div key={cell.label} className="bg-background px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                        {cell.label}
                      </p>
                      <p className="text-[26px] text-foreground tabular-nums">{cell.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-[26px]">
                  {/* WHAT THEY CONFESS — topic bars behind text, top 5 + toggle. */}
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      What they confess
                    </p>
                    {dash.topicRows.length === 0 ? (
                      <p className="text-muted-foreground">No confessions in range.</p>
                    ) : (
                      <>
                        {(topicsOpen ? dash.topicRows : dash.topicRows.slice(0, 5)).map(([key, n]) => (
                          <div key={key} className="relative border-b border-border px-[10px] py-[5px]">
                            <div
                              className="absolute inset-y-0 left-0 bg-muted"
                              style={{ width: `${(n / (dash.topicRows[0]?.[1] || 1)) * 100}%` }}
                            />
                            <div className="relative flex justify-between">
                              <span className={key === "untagged" ? "text-muted-foreground" : ""}>
                                {topicLabel(key)}
                              </span>
                              <span className="tabular-nums">
                                {n}{" "}
                                <span className="text-muted-foreground">
                                  {Math.round((n / (dash.totalCompleted || 1)) * 100)}%
                                </span>
                              </span>
                            </div>
                          </div>
                        ))}
                        {dash.topicRows.length > 5 ? (
                          <button
                            type="button"
                            onClick={() => setTopicsOpen((o) => !o)}
                            className="mt-2 text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                          >
                            {topicsOpen ? "Show top 5 only" : `+ ${dash.topicRows.length - 5} more`}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* BY SOURCE — one table joining scans ∪ confessions ∪ taps per source. */}
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      By source
                    </p>
                    <table className="w-full max-w-md">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                          <th className="py-0.5 text-left font-normal">Source</th>
                          <th className="hidden w-[70px] py-0.5 text-right font-normal min-[480px]:table-cell">
                            Scans
                          </th>
                          <th className="w-[70px] py-0.5 text-right font-normal">Conf.</th>
                          <th className="w-[70px] py-0.5 text-right font-normal">Taps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...dash.sourceRows.filter((r) => r.conf > 0),
                          ...(zeroOpen
                            ? dash.sourceRows.filter((r) => r.conf === 0)
                            : dash.sourceRows.filter((r) => r.conf === 0).slice(0, 2)),
                        ].map((r) => (
                          <tr key={r.source} className={r.conf === 0 ? "text-muted-foreground" : ""}>
                            <td className="py-0.5">{r.source}</td>
                            <td className="hidden py-0.5 text-right tabular-nums min-[480px]:table-cell">
                              {r.scans ?? "—"}
                            </td>
                            <td className="py-0.5 text-right tabular-nums">{r.conf}</td>
                            <td className="py-0.5 text-right tabular-nums">{r.taps ?? "—"}</td>
                          </tr>
                        ))}
                        {dash.sourceRows.filter((r) => r.conf === 0).length > 2 ? (
                          <tr>
                            <td colSpan={4} className="py-0.5">
                              <button
                                type="button"
                                onClick={() => setZeroOpen((o) => !o)}
                                className="text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                              >
                                {zeroOpen
                                  ? "Collapse zero-confession sources"
                                  : `+ ${dash.sourceRows.filter((r) => r.conf === 0).length - 2} more with no confessions`}
                              </button>
                            </td>
                          </tr>
                        ) : null}
                        <tr className="text-muted-foreground">
                          <td className="border-t-2 border-border py-0.5">direct (you)</td>
                          <td className="hidden border-t-2 border-border py-0.5 text-right tabular-nums min-[480px]:table-cell">
                            {dash.directRow.scans ?? "—"}
                          </td>
                          <td className="border-t-2 border-border py-0.5 text-right tabular-nums">
                            {dash.directRow.conf}
                          </td>
                          <td className="border-t-2 border-border py-0.5 text-right tabular-nums">
                            {dash.directRow.taps ?? "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* BY NIGHT — bar strip; the nightly table (unchanged, Copy included)
                      sits behind a toggle, default collapsed. */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        By night
                        {nightBars && nightBars.length > 0
                          ? ` · peak ${Math.max(...nightBars.map((b) => b.conf))}`
                          : ""}
                      </p>
                      {nightBars ? (
                        <p className="text-muted-foreground">
                          {nightBars.length} nights · {nightBars.filter((b) => b.conf > 0).length}{" "}
                          active
                        </p>
                      ) : null}
                    </div>
                    {nightBars && nightBars.length > 0 ? (
                      /* Flex bars: widths solve themselves at any night count. Empty
                         nights render as the 2px min-height floor tick at low contrast. */
                      <div className="mt-2 flex h-[54px] items-end gap-[2px]">
                        {nightBars.map((b) => (
                          <div
                            key={b.night}
                            title={`${formatNightLabel(b.night)} · ${b.conf}`}
                            className={cn(
                              "min-h-[2px] flex-1",
                              b.conf > 0 ? "bg-muted-foreground" : "bg-muted",
                            )}
                            style={{
                              height: `${(b.conf / Math.max(1, ...nightBars.map((x) => x.conf))) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-muted-foreground">No venue nights in range.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setNightTableOpen((o) => !o)}
                      className="mt-2 text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      {nightTableOpen ? "Hide nightly table" : "Show nightly table"}
                    </button>
                    {nightTableOpen ? (
                      dash.nightRows.length === 0 ? (
                        <p className="mt-2 text-muted-foreground">No venue nights in range.</p>
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
                      )
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading stats…</p>
            )}
          </div>
        )
        ) : null}

        {/* ── MODERATE TAB (server-side, paginated). Scanned for good ones, not cleared.
            Queue interactions: page checkbox → bulk bar → optional "select all M matching"
            (explicit, real count, spans pages). Keyboard: A/R/F on the focused card,
            ↑/↓ move focus, decisions auto-advance. Every decision has a ~4s Undo. ── */}
        {consoleTab === "moderate" ? (
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

          {/* Filter row. Venue moved to the persistent bar above the tabs; topic is
              moderation-specific and stays here (client-side filter). */}
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              aria-label="Select visible page"
              checked={
                visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id))
                  ? true
                  : visibleRows.some((r) => selected.has(r.id))
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={() => {
                const allOn = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
                setSelected((prev) => {
                  const next = new Map(prev);
                  if (allOn) visibleRows.forEach((r) => next.delete(r.id));
                  else visibleRows.forEach((r) => next.set(r.id, r));
                  return next;
                });
              }}
            />
            <Select value={qTopic} onValueChange={setQTopic}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {Object.entries(TOPIC_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
                <SelectItem value="untagged">Untagged</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="search"
              placeholder="Search text…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="h-8 min-w-40 flex-1 text-xs"
            />
          </div>

          {/* Bulk bar — appears with the first selection. "Select all M matching" is the
              deliberate second step that extends selection across ALL pages, with the
              real count; never silent. */}
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="text-xs font-medium">{selected.size} selected</span>
              {tab === "pending" ? (
                <Button
                  size="sm"
                  className="bg-ritual text-background hover:bg-ritual/90"
                  disabled={bulkBusy}
                  onClick={() => setConfirmBulk({ status: "approved", label: `Approve ${selected.size}` })}
                >
                  Approve {selected.size}
                </Button>
              ) : null}
              {tab !== "rejected" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkBusy}
                  onClick={() =>
                    setConfirmBulk({
                      status: "rejected",
                      label: `${tab === "approved" ? "Un-approve" : "Reject"} ${selected.size}`,
                    })
                  }
                >
                  {tab === "approved" ? "Un-approve" : "Reject"} {selected.size}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  onClick={() => setConfirmBulk({ status: "pending", label: `Restore ${selected.size}` })}
                >
                  Restore {selected.size}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Map())}>
                Clear
              </Button>
              {matchingTotal !== null && matchingTotal > selected.size ? (
                <button
                  type="button"
                  disabled={matchingLoading}
                  onClick={selectAllMatching}
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  {matchingLoading ? "Counting…" : `Select all ${matchingTotal} matching this filter`}
                </button>
              ) : null}
              {matchingCapped ? (
                <span className="text-[11px] text-muted-foreground">(first {MATCHING_CAP} only)</span>
              ) : null}
            </div>
          ) : null}

          {/* Bulk confirmation — required before any bulk decision fires. */}
          <AlertDialog open={!!confirmBulk} onOpenChange={(o) => { if (!o) setConfirmBulk(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmBulk?.label} confessions?</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmBulk?.status === "approved"
                    ? "They'll appear on the public wall."
                    : confirmBulk?.status === "pending"
                      ? "They'll return to the pending queue."
                      : "They'll come off the wall and the queue."}{" "}
                  You can undo for a few seconds after.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={cn(
                    confirmBulk?.status === "approved" && "bg-ritual text-background hover:bg-ritual/90",
                    confirmBulk?.status === "rejected" &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  onClick={() => {
                    const targets = [...selected.values()];
                    const status = confirmBulk?.status;
                    setConfirmBulk(null);
                    if (status) decide(targets, status);
                  }}
                >
                  {confirmBulk?.label}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {rows.length > 0
                ? "No matches for this topic on this page."
                : qDebounced.trim()
                  ? "No matches."
                  : `Nothing ${tab}.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((row, idx) => {
                const flagged = isFlagged(row);
                return (
                  <li
                    key={row.id}
                    onClick={() => setFocusIdx(idx)}
                    className={cn(
                      "flex gap-3 rounded-lg border border-border p-3",
                      flagged && "border-l-4 border-l-amber-500",
                      idx === focusIdx && "border-ritual/60",
                    )}
                  >
                    <Checkbox
                      className="mt-1"
                      aria-label={`Select #${row.subject_number}`}
                      checked={selected.has(row.id)}
                      onCheckedChange={(c) =>
                        setSelected((prev) => {
                          const next = new Map(prev);
                          if (c === true) next.set(row.id, row);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>#{row.subject_number}</span>
                        <SourceBadge source={row.source} />
                        <TopicBadge topic={row.topic} />
                        {flagged ? (
                          <span className="rounded bg-amber-500/15 text-amber-500 px-1.5 py-0.5 text-[11px] font-medium">
                            review
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{row.confession_text}</p>
                      {row.verdict_text ? (
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground border-l-2 border-border pl-3">
                          {row.verdict_text}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                      {tab === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-ritual text-background hover:bg-ritual/90"
                            disabled={bulkBusy}
                            onClick={() => decide([row], "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={bulkBusy}
                            onClick={() => decide([row], "rejected")}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {tab === "approved" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={bulkBusy}
                          onClick={() => decide([row], "rejected")}
                        >
                          Un-approve
                        </Button>
                      ) : null}
                      {tab === "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={bulkBusy}
                          onClick={() => decide([row], "pending")}
                        >
                          Restore
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === row.id}
                        aria-pressed={!!row.homepage_featured}
                        title={
                          row.homepage_featured
                            ? "Featured on homepage — click to remove"
                            : "Feature on homepage"
                        }
                        onClick={() => toggleFeatured(row)}
                        className={cn(
                          "text-[11px]",
                          row.homepage_featured ? "text-ritual" : "text-muted-foreground",
                        )}
                      >
                        {row.homepage_featured ? "★ Featured" : "☆ Feature"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        ) : null}
      </div>
    </main>
  );
};

export default Moderate;
