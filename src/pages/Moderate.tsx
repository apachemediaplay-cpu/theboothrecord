import { useState, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import QRCode from "qrcode";
import type { Session } from "@supabase/supabase-js";
import { supabaseModeration as sb } from "@/integrations/supabase/moderation-client";
import type { Database } from "@/integrations/supabase/types";
import venuesData from "@/data/venues.json";
import { ReelAction, ReelBulkAction } from "@/components/booth_reels";
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
import { venueDisplayName, DEFAULT_PROMPT } from "@/lib/source";
import { fetchVenueRegister, getPlaceholderLines } from "@/lib/registers";
import { cn } from "@/lib/utils";

// `topic`/`is_test` are forward-only columns not in the generated types; the frontend
// only reads them (written server-side by generate-verdict / tag_confession).
type Confession = Database["public"]["Tables"]["confessions"]["Row"] & {
  topic: string | null;
  is_test: boolean | null;
  homepage_featured: boolean | null;
  // Whether the share card prints the venue name or LOCATION WITHHELD. Written
  // once by generate-verdict from the illegal-content classifier, now editable
  // here via admin_set_stamp_venue. NULL is treated as ON — older rows predate
  // the column and every screen fails open on null, not closed.
  stamp_venue?: boolean | null;
  // Prompt-mode routing (20260807100000): which pinned prompt answered this
  // row. 'default' AND historical 'solo' both render unmarked (see the marker
  // comment at the render site); only a genuinely different mode gets the
  // quiet badge. Optional because the generated types predate the column.
  mode?: string | null;
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
  // Per-venue prompt routing (venues.prompt_mode). NULL means "use the
  // default mode" — distinguishable from an explicit 'default' by design.
  prompt_mode?: string | null;
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
  { value: "greed", label: "Greed" },
  { value: "vanity", label: "Vanity" },
  { value: "appetite", label: "Appetite" },
] as const;
const registerLabel = (value: string) =>
  REGISTER_OPTIONS.find((o) => o.value === value)?.label ?? value;

// The four editable placeholder sets (public.registers keys). 'dtc' is the default
// set — what venues.register null resolves to — and is never itself a
// venues.register value. Content rules mirrored from admin_set_register_lines,
// plus the six-line rule so rotation pacing never drifts between sets.
const REGISTER_SET_META = [
  { key: "dtc", label: "Default (DTC)" },
  { key: "social", label: "Social" },
  { key: "intimate", label: "Intimate" },
  { key: "edgy", label: "Edgy" },
  { key: "greed", label: "Greed" },
  { key: "vanity", label: "Vanity" },
  { key: "appetite", label: "Appetite" },
] as const;

// Register row as fetched from public.registers: the six lines plus the DB-owned
// description (surfaced under the register label in the dropdowns and the sets
// list — copy that gets refined, so it must never be hardcoded client-side).
type RegisterSetInfo = { lines: string[]; description: string | null };
const REGISTER_SET_LINES = 6;
const REGISTER_LINE_MAX = 80;

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

// Relative time for the venue sample's metadata line — the wall's register
// ("2 hr ago"), console-cased.
const fmtAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

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
// Live mock of the confess screen: listening line, headline, subline, cycling
// placeholder, input rule. REBUILT rather than reusing Confess.tsx — the real
// screen bakes its typing loop into the page alongside textarea state, speech
// recognition, source capture, a consent redirect and the wake lock; mounting
// it here would drag all of that into the console. What IS shared: the same
// classes for the load-bearing treatments (font-control headline, mono
// sublines, listen-glow listening line, muted-foreground/40 input rule) and
// the SAME typing rhythm as the real placeholder (50ms/char, 2s hold, loop) —
// the register's whole point is the rotation, and one static line wouldn't
// show it. Proportions are scaled, not pixel-exact: it answers "does this
// read right", not "is this the phone".
const ConfessPreview = ({
  headline,
  guidance,
  lines,
}: {
  headline: string;
  guidance: string | null;
  lines: string[];
}) => {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  // Restart from the first line whenever the SET changes (register switch).
  useEffect(() => {
    setIdx(0);
  }, [lines]);
  useEffect(() => {
    const line = lines[idx % Math.max(lines.length, 1)] ?? "";
    let ch = 0;
    let hold: number | undefined;
    setTyped("");
    const t = window.setInterval(() => {
      ch++;
      setTyped(line.slice(0, ch));
      if (ch >= line.length) {
        window.clearInterval(t);
        hold = window.setTimeout(() => setIdx((i) => (i + 1) % Math.max(lines.length, 1)), 2000);
      }
    }, 50);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(hold);
    };
  }, [idx, lines]);
  return (
    <div className="self-start rounded-md border border-border bg-background p-4">
      <p className="mb-5 flex items-center gap-1.5 text-[10px] font-mono-light tracking-wide text-ritual">
        <span className="listen-glow-dot inline-block h-[5px] w-[5px] rounded-full bg-[hsl(var(--ritual-green))]" />
        <span className="listen-glow-text">the booth is listening</span>
      </p>
      <p className="font-control text-lg font-bold leading-tight text-foreground">{headline}</p>
      {guidance ? (
        <p className="mt-1 text-[11px] font-mono-light text-muted-foreground">{guidance}</p>
      ) : null}
      <div className="mt-6">
        <p className="min-h-[2.6em] text-[11px] font-mono-light leading-snug text-muted-foreground/60">
          {typed}
          <span className="animate-pulse">|</span>
        </p>
        <div className="mt-1 border-b border-muted-foreground/40" />
      </div>
      <p className="mt-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
        Live preview
      </p>
    </div>
  );
};

// The verdict-prompt dropdown — ONE component for venues and the Direct
// channel (same options, same guarantees), so the two can never drift.
// A DROPDOWN, not free text — a typo'd mode would fall back to default
// silently at verdict time with nothing to say why. Options show mode AND
// live version, so a wrong version is visible without opening the Prompt
// modes panel. Load failure DISABLES the control — an empty list would look
// like there are no modes. 'dtc' is EXCLUDED from the options: it's the
// Direct channel's compatibility shim (an audience marker, not a prompt
// style) and nothing should ever be pointed at it deliberately.
const VerdictPromptSelect = ({
  value,
  busy,
  promptModes,
  onChange,
}: {
  value: string | null; // null = "use the default mode"
  busy: boolean;
  promptModes: { mode: string; version: string }[] | null | undefined;
  onChange: (value: string | null) => void;
}) => {
  if (!promptModes) {
    return (
      <>
        <Select disabled value={undefined}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue
              placeholder={promptModes === null ? "Prompt modes unavailable" : "Loading…"}
            />
          </SelectTrigger>
        </Select>
        {promptModes === null ? (
          <span className="block pt-1 text-[10px] text-muted-foreground">
            Couldn't load prompt modes — retry from the Prompt modes panel.
          </span>
        ) : null}
      </>
    );
  }
  const defaultModeVersion = promptModes.find((m) => m.mode === "default")?.version;
  const options = promptModes.filter((m) => m.mode !== "default" && m.mode !== "dtc");
  return (
    <Select
      value={value ?? "__default__"}
      onValueChange={(v) => onChange(v === "__default__" ? null : v)}
      disabled={busy}
    >
      <SelectTrigger className="h-8 w-56 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Top option = NULL (the fallback), shown with the default mode's
            live version. Distinct from an explicit choice by design. */}
        <SelectItem value="__default__">default · {defaultModeVersion ?? "?"}</SelectItem>
        {options.map((m) => (
          <SelectItem key={m.mode} value={m.mode}>
            {m.mode} · {m.version}
          </SelectItem>
        ))}
        {value && !options.some((m) => m.mode === value) ? (
          // Pointing at a mode that isn't offered (deleted, or the dtc shim) —
          // keep it selectable so the state stays visible rather than being
          // silently re-rendered as default.
          <SelectItem value={value}>
            {value} · {promptModes.find((m) => m.mode === value)?.version ?? "?"}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
};

// DIRECT — the first channel in the Channels list, and deliberately IN THIS
// LIST rather than in Prompt modes: Direct is an AUDIENCE, not a prompt
// style. Nobody assigns a venue to it (the client picks it when there's no
// source), so its venue count is structurally always zero — shown as a peer
// of the modes it read as a dead row inviting deletion. Here it reads as
// what it is: the channel carrying the largest traffic slice, with the same
// two-part shape as a venue (BEFORE THEY TYPE: the site_copy greeting;
// AFTER THEY TYPE: a verdict prompt), so nobody has to remember it's
// special. It cannot be created, renamed, deactivated or deleted — no
// Rename, no ACTIVE toggle, no Delete, no QR, no slug.
const DirectChannelRow = ({
  siteCopy,
  busy,
  promptModes,
  onSaveGreeting,
  onPromptMode,
  onRegister,
  registerDesc,
  linesFor,
  onRetry,
}: {
  siteCopy:
    | { headline: string; guidance: string; promptMode: string | null; register: string | null }
    | null
    | undefined;
  busy: boolean;
  promptModes: { mode: string; version: string }[] | null | undefined;
  onSaveGreeting: (headline: string, guidance: string) => void;
  onPromptMode: (value: string | null) => void;
  onRegister: (value: string) => void;
  registerDesc?: (value: string) => string | null;
  linesFor: (register: string) => string[];
  onRetry: () => void;
}) => {
  // Expanded by default — Direct is the channel most often being tuned.
  const [expanded, setExpanded] = useState(true);
  // Live-preview draft: tracks the greeting editor's KEYSTROKES (via
  // onDraftChange) so the preview updates as you type, exactly as a venue's
  // does; resets to the committed values whenever they change (save landed
  // or refetch).
  const [draft, setDraft] = useState<{ headline: string; guidance: string } | null>(null);
  const committedHeadline = siteCopy && siteCopy !== null ? siteCopy.headline : "";
  const committedGuidance = siteCopy && siteCopy !== null ? siteCopy.guidance : "";
  useEffect(() => {
    setDraft(null);
  }, [committedHeadline, committedGuidance]);
  // Preview resolution mirrors the live screen's rule for DIRECT traffic:
  // Direct's greeting IS the site default, so a blank headline falls straight
  // to the hardcoded pair — headline and guidance travelling together.
  const effHeadline = draft ? draft.headline : committedHeadline;
  const effGuidance = draft ? draft.guidance : committedGuidance;
  const previewHeadline = effHeadline.trim() || DEFAULT_PROMPT.headline;
  const previewGuidance = effHeadline.trim()
    ? effGuidance.trim() || null
    : DEFAULT_PROMPT.guidance || null;
  const register = siteCopy && siteCopy !== null ? (siteCopy.register ?? "default") : "default";
  return (
    <li className="py-4">
      <div
        className="flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-1"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">Direct</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          no venue
        </span>
        <span className="text-[11px] text-muted-foreground">
          Instagram · shared cards · typed URL
        </span>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-5 pb-2 pl-7">
          {siteCopy === undefined ? (
            <p className="py-2 text-sm text-muted-foreground">Loading…</p>
          ) : siteCopy === null ? (
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground">Couldn't load the Direct channel.</p>
              <Button size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            </div>
          ) : (
            // Same two-column shape as a venue: groups left, live preview
            // right. Direct is the panel that most NEEDS the preview — the
            // largest audience, and the one channel that can't be checked by
            // scanning a QR in a venue.
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-5">
                <div className="space-y-4 rounded-md border border-border/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Before they type
                  </p>
                  <DefaultGreetingEditor
                    key={`${siteCopy.headline}\n${siteCopy.guidance}`}
                    initialHeadline={siteCopy.headline}
                    initialGuidance={siteCopy.guidance}
                    busy={busy}
                    onSave={onSaveGreeting}
                    onDraftChange={(h, g) => setDraft({ headline: h, guidance: g })}
                  />
                  <Field label="Placeholders">
                    {/* Same control every venue has — stored in
                        site_copy.register, driving the LIVE placeholder set
                        for all no-source traffic (venue → site_copy → 'dtc'
                        coalesce in get_confess_config), and giving the
                        preview its register. */}
                    <Select value={register} onValueChange={onRegister} disabled={busy}>
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGISTER_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            <div>
                              {o.label}
                              {registerDesc?.(o.value) ? (
                                <span className="block text-[10px] text-muted-foreground">
                                  {registerDesc(o.value)}
                                </span>
                              ) : null}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {registerDesc?.(register) ? (
                      <span className="block pt-1 text-[10px] text-muted-foreground">
                        {registerDesc(register)}
                      </span>
                    ) : null}
                  </Field>
                </div>
                <div className="space-y-4 rounded-md border border-border/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    After they type
                  </p>
                  <Field label="Verdict prompt">
                    {/* The SAME component and options as a venue's dropdown.
                        Stored in site_copy.prompt_mode (Direct has no venue
                        row); the client sends the stored mode once the config
                        lands, replacing its mount-time 'dtc' marker. Unset →
                        'default'. */}
                    <VerdictPromptSelect
                      value={siteCopy.promptMode}
                      busy={busy}
                      promptModes={promptModes}
                      onChange={onPromptMode}
                    />
                  </Field>
                </div>
              </div>
              <ConfessPreview
                key={register}
                headline={previewHeadline}
                guidance={previewGuidance}
                lines={linesFor(register)}
              />
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
};

const VenueOverviewRow = ({
  row,
  scans,
  approved,
  pending,
  oldestPendingAt,
  onOpenQueue,
  busy,
  expanded,
  onToggleExpand,
  onRegister,
  onActive,
  onSaveGreeting,
  onCopyReport,
  onDelete,
  registerDesc,
  promptModes,
  onPromptMode,
  onRename,
  linesFor,
  defaultGreeting,
}: {
  row: VenueAdminRow;
  scans: number | null; // null = scan counts unavailable
  approved: number | null; // ALL-TIME approved count; null = unavailable → "—"
  pending: number | null; // ALL-TIME pending count; null = unavailable
  oldestPendingAt: string | null; // oldest pending created_at; null = omit age
  onOpenQueue: () => void; // → Moderate tab, this venue, Pending sub-tab
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRegister: (value: string) => void;
  onActive: (next: boolean) => void;
  onSaveGreeting: (headline: string, guidance: string) => void;
  onCopyReport: () => Promise<void>;
  onDelete: () => void;
  registerDesc?: (value: string) => string | null;
  // prompt_modes rows: undefined = loading, null = failed (dropdown disabled —
  // an empty list would look like there are no modes).
  promptModes: { mode: string; version: string }[] | null | undefined;
  onPromptMode: (value: string | null) => void;
  onRename: (name: string) => void;
  linesFor: (register: string) => string[];
  defaultGreeting: { headline: string; guidance: string } | null | undefined;
}) => {
  // Reentrancy guard for Copy report — the button is NEVER disabled (a venue with
  // no data still copies an honest report); in-flight clicks are just ignored.
  const [copying, setCopying] = useState(false);
  const [headline, setHeadline] = useState(row.headline ?? "");
  const [guidance, setGuidance] = useState(row.guidance ?? "");
  // Rename affordance for the header identity — closed by default; the name
  // is set once and edited rarely, so it hides behind a quiet control.
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(row.display_name);
  const dirty =
    headline.trim() !== (row.headline ?? "") || guidance.trim() !== (row.guidance ?? "");
  // Preview resolution mirrors the live screen's rule: headline and guidance
  // TRAVEL TOGETHER per level (venue → site default → hardcoded) — a blank
  // draft headline falls to the default level entirely, never mixing levels.
  const previewHeadline = headline.trim()
    ? headline.trim()
    : (defaultGreeting?.headline ?? DEFAULT_PROMPT.headline);
  const previewGuidance = headline.trim()
    ? guidance.trim() || null
    : (defaultGreeting?.guidance ?? DEFAULT_PROMPT.guidance) || null;
  const previewLines = linesFor(row.register ?? "dtc");
  // Fail-safe: a missing/null status is treated as active — dimming is opt-in only.
  const active = row.active !== false;

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
      {/* Collapsed row: chevron + name + slug + muted register·scans·approved, with
          the active toggle on the right. The whole row toggles expand EXCEPT the
          toggle — flipping active/inactive must never require expanding.
          NO completion percentage — scans and confessions don't measure the
          same thing, so the ratio is meaningless (Seoul Tiger read 320%,
          Ovolo 117%). Percentages were removed from the Stats tab for this
          reason and must not come back here. */}
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
          {/* ALL-TIME approved (the windowed stats above are range-scoped; this
              deliberately isn't): under 3, /record/:venue redirects — that
              threshold is what decides whether the venue has a page you can
              send them, hence "page dormant". "—" on failure, the scans
              convention. */}
          {approved === null ? "—" : approved} approved
          {approved !== null && approved < 3 ? " · page dormant" : ""}
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
          {/* IDENTITY — set once, not edited weekly, so it lives up here by the
              header rather than among the working fields. The display name has
              a quiet rename affordance; the SLUG is permanent by design (it's
              printed on QR cards and is the attribution key on every
              historical row) and is shown, never editable. */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {renaming ? (
              <>
                <Input
                  value={nameDraft}
                  maxLength={80}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-7 w-56 text-xs"
                />
                <Button
                  size="sm"
                  disabled={busy || !nameDraft.trim() || nameDraft.trim() === row.display_name}
                  onClick={() => {
                    onRename(nameDraft);
                    setRenaming(false);
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(row.display_name);
                  setRenaming(true);
                }}
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Rename
              </button>
            )}
            <span>· slug {row.source} is permanent</span>
          </div>

          {/* GROUPED BY MOMENT, NOT BY DATA TYPE: the first three settings
              shape what someone WRITES (they see them before they type); the
              fourth shapes what the machine SAYS BACK (it acts after they
              type). Naming the groups by moment means a future setting has an
              obvious home and nobody has to remember which field does what. */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-5">
              <div className="space-y-4 rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Before they type
                </p>
                {/* Full-width greeting inputs — the whole line must be readable,
                    never truncated (the old inline flex-1 layout clipped long
                    headlines). Draft-then-commit via the Save button below —
                    live-committing would drop input focus mid-keystroke (see
                    the Field component note). */}
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
                <Field label="Placeholders">
                  <Select
                    value={row.register ?? "default"}
                    onValueChange={onRegister}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGISTER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <div>
                            {o.label}
                            {registerDesc?.(o.value) ? (
                              <span className="block text-[10px] text-muted-foreground">
                                {registerDesc(o.value)}
                              </span>
                            ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {registerDesc?.(row.register ?? "default") ? (
                    <span className="block pt-1 text-[10px] text-muted-foreground">
                      {registerDesc(row.register ?? "default")}
                    </span>
                  ) : null}
                </Field>
              </div>

              <div className="space-y-4 rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  After they type
                </p>
                <Field label="Verdict prompt">
                  {/* Shared with the Direct channel — see VerdictPromptSelect
                      for the dropdown-not-free-text and disabled-on-failure
                      reasoning. */}
                  <VerdictPromptSelect
                    value={row.prompt_mode ?? null}
                    busy={busy}
                    promptModes={promptModes}
                    onChange={onPromptMode}
                  />
                </Field>
              </div>

              {/* ON THE RECORD answers exactly TWO questions and only two:
                  does this venue have anything on the wall, and is anything
                  waiting on me. NO confession or verdict text — judging
                  verdicts happens in the Moderate tab where they can be acted
                  on; one out of context here doesn't help decide anything. */}
              <div className="space-y-1.5 rounded-md border border-border/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  On the record
                </p>
                {approved === null && pending === null ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (approved ?? 0) === 0 && (pending ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No confessions yet</p>
                ) : (
                  <>
                    {/* "page dormant" / "page live" is the ONLY warning that
                        See the record bounces to /thewall below the 3-approved
                        floor — the link itself stays unconditional (below). */}
                    <p className="text-xs tabular-nums">
                      {approved === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : approved < 3 ? (
                        <>
                          <span className="text-foreground">{approved} of 3 approved</span>
                          <span className="text-muted-foreground"> · page dormant</span>
                        </>
                      ) : (
                        <>
                          <span className="text-foreground">{approved} approved</span>
                          <span className="text-muted-foreground"> · page live</span>
                        </>
                      )}
                    </p>
                    {pending !== null && pending > 0 ? (
                      <p className="text-xs tabular-nums">
                        <span className="text-foreground">{pending} pending</span>
                        {oldestPendingAt ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · oldest {fmtAgo(oldestPendingAt)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-4 pt-1">
                      <button
                        type="button"
                        onClick={onOpenQueue}
                        className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                      >
                        Open the queue →
                      </button>
                      {/* ALWAYS shown, NO threshold and NO conditional label:
                          below 3 approved, /record/:venue redirects to
                          /thewall BY DESIGN — "page dormant" above is the one
                          warning, and link logic restating it would be a
                          second place to keep in step. */}
                      <a
                        href={`/record/${row.source}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                      >
                        See the record →
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>

            <ConfessPreview
              key={row.register ?? "default"}
              headline={previewHeadline}
              guidance={previewGuidance}
              lines={previewLines}
            />
          </div>
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
  registerDesc,
}: {
  takenSlugs: Set<string>;
  registerDesc?: (value: string) => string | null;
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
                  <div>
                    {o.label}
                    {registerDesc?.(o.value) ? (
                      <span className="block text-[10px] text-muted-foreground">
                        {registerDesc(o.value)}
                      </span>
                    ) : null}
                  </div>
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

// The default (no-venue) greeting editor — site_copy.default_prompt, the copy all
// Instagram / shared-card / direct traffic sees on /confess. Same seed-once +
// remount-on-save pattern as RegisterSetEditor; blank headline can't be saved
// (the client resolver would just skip the level, so we refuse it here too).
const DefaultGreetingEditor = ({
  initialHeadline,
  initialGuidance,
  busy,
  onSave,
  onDraftChange,
}: {
  initialHeadline: string;
  initialGuidance: string;
  busy: boolean;
  onSave: (headline: string, guidance: string) => void;
  // Reports keystrokes upward so the Direct channel's live preview can track
  // the DRAFT, not just the committed values. Optional — the editor's own
  // draft-then-commit behaviour is unchanged.
  onDraftChange?: (headline: string, guidance: string) => void;
}) => {
  const [headline, setHeadline] = useState(initialHeadline);
  const [guidance, setGuidance] = useState(initialGuidance);
  const dirty =
    headline.trim() !== initialHeadline.trim() || guidance.trim() !== initialGuidance.trim();
  const valid = headline.trim() !== "";
  return (
    <div className="space-y-3 py-1">
      <Field label="Headline">
        <Input
          value={headline}
          maxLength={80}
          onChange={(e) => {
            setHeadline(e.target.value);
            onDraftChange?.(e.target.value, guidance);
          }}
          className="h-8 w-full text-xs"
        />
      </Field>
      <Field label="Subline (optional)">
        <Input
          value={guidance}
          maxLength={80}
          onChange={(e) => {
            setGuidance(e.target.value);
            onDraftChange?.(headline, e.target.value);
          }}
          className="h-8 w-full text-xs"
        />
      </Field>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          disabled={!dirty || !valid || busy}
          onClick={() => onSave(headline.trim(), guidance.trim())}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
        {!valid ? (
          <span className="text-[11px] text-destructive">headline required</span>
        ) : null}
      </div>
    </div>
  );
};

// One prompt-mode row: the mode as a fixed label, its live version editable.
// Same lifecycle as the default-greeting editor — seeds from the DB value,
// parent keys on the row content so a landed save remounts clean. The version
// shown IS what's live (within the edge function's 60s cache); there is no
// preview, deliberately — a preview would imply a capability that doesn't
// exist.
const PromptModeRow = ({
  mode,
  initialVersion,
  busy,
  caption,
  onSave,
  onDelete,
}: {
  mode: string;
  initialVersion: string;
  busy: boolean;
  // Usage in plain words ("used by 8 venues + direct" / "not in use") —
  // derived client-side, see promptModeCaption. Null = reads unresolved →
  // no line, never fake zeros.
  caption: string | null;
  onSave: (version: string) => void;
  // Absent for 'default' — the fallback the whole system rests on can never
  // offer a delete control at all.
  onDelete?: () => void;
}) => {
  const [version, setVersion] = useState(initialVersion);
  const dirty = version.trim() !== initialVersion.trim();
  const valid = version.trim() !== "";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 font-mono-light text-xs uppercase tracking-wide">
          {mode}
        </span>
        <Input
          value={version}
          maxLength={40}
          onChange={(e) => setVersion(e.target.value)}
          className="h-8 w-full text-xs"
        />
        <Button size="sm" disabled={!dirty || !valid || busy} onClick={() => onSave(version.trim())}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {onDelete ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className="text-[11px] text-destructive/80 underline underline-offset-2 transition-colors hover:text-destructive"
              >
                Delete
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete mode {mode}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A mode any venue is using will refuse to delete and name the venues.
                  Historical confessions keep their {mode} stamp either way.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDelete}
                >
                  Delete {mode}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {caption ? (
        <p className="pl-20 text-[10px] text-muted-foreground/70">{caption}</p>
      ) : null}
    </div>
  );
};

// Add-mode row: a new mode from the console without a migration. Client
// mirror of admin_add_prompt_mode's checks (slug shape, taken, version
// required); the server re-validates everything.
const AddPromptModeRow = ({
  busy,
  taken,
  onAdd,
}: {
  busy: boolean;
  taken: string[];
  onAdd: (mode: string, version: string) => Promise<boolean>;
}) => {
  const [mode, setMode] = useState("");
  const [version, setVersion] = useState("");
  const m = mode.trim().toLowerCase();
  const valid = /^[a-z0-9_-]{1,40}$/.test(m) && !taken.includes(m) && version.trim() !== "";
  return (
    <div className="flex items-center gap-2 border-t border-border/50 pt-2">
      {/* Name gets the flexible width (mode names are words and the narrow
          box clipped its own placeholder); version is fixed narrow — it's a
          two-digit OpenAI version number. */}
      <Input
        value={mode}
        maxLength={40}
        placeholder="new mode"
        onChange={(e) => setMode(e.target.value)}
        className="h-8 w-full text-xs"
      />
      <Input
        value={version}
        maxLength={40}
        placeholder="version"
        onChange={(e) => setVersion(e.target.value)}
        className="h-8 w-24 shrink-0 text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!valid || busy}
        onClick={async () => {
          if (await onAdd(m, version.trim())) {
            setMode("");
            setVersion("");
          }
        }}
      >
        {busy ? "Adding…" : "Add"}
      </Button>
    </div>
  );
};

// One placeholder set (public.registers row): exactly six lines, none blank, each
// ≤80 chars — the client mirror of admin_set_register_lines' checks. Seeds from
// the DB row once; the parent keys this component on the row content, so a landed
// save (or refetch) remounts it clean with dirty reset.
const RegisterSetEditor = ({
  label,
  description,
  initial,
  busy,
  onSave,
}: {
  label: string;
  description?: string | null;
  initial: string[];
  busy: boolean;
  onSave: (lines: string[]) => void;
}) => {
  const [lines, setLines] = useState<string[]>(() => {
    const seeded = initial.slice(0, REGISTER_SET_LINES);
    while (seeded.length < REGISTER_SET_LINES) seeded.push("");
    return seeded;
  });
  const trimmed = lines.map((l) => l.trim());
  const valid = trimmed.every((l) => l !== "" && l.length <= REGISTER_LINE_MAX);
  const dirty = trimmed.some((l, i) => l !== (initial[i] ?? "")) || initial.length !== REGISTER_SET_LINES;
  return (
    <div className="space-y-2 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {/* DB-owned description — a reminder of the intended room, not a heading. */}
        {description ? (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={line}
            maxLength={REGISTER_LINE_MAX}
            onChange={(e) =>
              setLines((cur) => cur.map((l, j) => (j === i ? e.target.value : l)))
            }
            className="h-8 w-full text-xs"
          />
          <span
            className={cn(
              "w-12 shrink-0 text-right text-[11px] tabular-nums",
              line.trim() === "" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {line.trim() === "" ? "blank" : `${line.trim().length}/${REGISTER_LINE_MAX}`}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={!dirty || !valid || busy} onClick={() => onSave(trimmed)}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {!valid ? (
          <span className="text-[11px] text-destructive">six non-blank lines required</span>
        ) : null}
      </div>
    </div>
  );
};

// True-ratio percentage (numerator ⊆ denominator), used by the stat blocks below
// the funnel (returning/views, engaged-per-arrival-bucket).
//
// DELIBERATELY NOT USED IN THE FUNNEL LINE: adjacent funnel stages don't share a
// denominator — log_scan fires once per session at the gate, but one session can
// produce several confessions, and confessions can arrive with no scan logged —
// so stage-to-stage "conversions" printed over 100% (118%/145% observed) and
// implied a rate that doesn't exist. Do not re-add percentages to the funnel.
const stagePct = (numerator: number, denominator: number): string =>
  denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";

// One funnel window as a single line: SCANS n → CONFESSIONS n → SHARES n →
// OFFENCE n → WALL n. Raw counts only, arrows as separators (see stagePct's
// comment for why there are no percentages). Current window bright, previous
// muted for comparison.
const FunnelLine = ({
  title,
  scans,
  confessions,
  shares,
  offenceTaps,
  wallViews,
  bright,
}: {
  title: string;
  scans: number;
  confessions: number;
  shares: number;
  offenceTaps: number;
  wallViews: number;
  bright?: boolean;
}) => {
  const stages = [
    { label: "SCANS", n: scans },
    { label: "CONFESSIONS", n: confessions },
    { label: "SHARES", n: shares },
    { label: "OFFENCE", n: offenceTaps },
    { label: "WALL", n: wallViews },
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {title}
      </span>
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-baseline gap-2">
          {i > 0 ? (
            <span className="text-[10px] text-muted-foreground/50">→</span>
          ) : null}
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.label}
          </span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              bright ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {s.n}
          </span>
        </span>
      ))}
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
  type ConsoleTab = "moderate" | "venues" | "stats" | "wall";
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>(() => {
    const s = sessionStorage.getItem("booth-console-tab");
    return s === "venues" || s === "stats" || s === "wall" ? s : "moderate";
  });
  const changeConsoleTab = (t: ConsoleTab) => {
    setConsoleTab(t);
    sessionStorage.setItem("booth-console-tab", t);
  };

  // ── Wall tab: the scans → confessions → shares → wall funnel, two fixed 7-night
  // windows from admin_wall_funnel. No range/venue axis — the windows are fixed by
  // design, so the global filter bar is disabled on this tab (visibly, like Venues).
  type WallFunnelRow = {
    period: string;
    scans: number;
    confessions: number;
    shares: number;
    offence_taps: number;
    wall_views: number;
    wall_engaged: number;
    wall_ig_direct: number;
    wall_returning: number;
    wall_direct: number;
    wall_internal: number;
    wall_engaged_direct: number;
    wall_engaged_internal: number;
  };
  const [wallFunnel, setWallFunnel] = useState<WallFunnelRow[] | null>(null);
  const [wallFunnelError, setWallFunnelError] = useState(false);

  // ── Placeholder sets (public.registers): the content behind the register picker.
  // Public-read table (the same data the confess screen's get_confess_config serves);
  // writes only via admin_set_register_lines. null map = still loading.
  const [registerSets, setRegisterSets] = useState<Map<string, RegisterSetInfo> | null>(null);
  const [registerSetsError, setRegisterSetsError] = useState(false);
  const [registerSetsOpen, setRegisterSetsOpen] = useState(false);
  const [registerSetBusy, setRegisterSetBusy] = useState<string | null>(null);

  // ── Default (no-venue) greeting: site_copy.default_prompt.
  // undefined = loading, null = load failed, object = editable values.
  const [siteCopy, setSiteCopy] = useState<
    | { headline: string; guidance: string; promptMode: string | null; register: string | null }
    | null
    | undefined
  >(undefined);
  const [siteCopyBusy, setSiteCopyBusy] = useState(false);
  // Prompt modes (prompt_modes table): undefined = loading, null = failed.
  // Busy holds the mode being saved, or "__add__" for the add row.
  const [promptModes, setPromptModes] = useState<
    { mode: string; version: string }[] | null | undefined
  >(undefined);
  const [promptModeBusy, setPromptModeBusy] = useState<string | null>(null);

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
  // Hard delete: the row pending permanent deletion (confirm dialog open) + the
  // in-flight lock.
  const [confirmDelete, setConfirmDelete] = useState<Confession | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // BULK hard delete. This reverses the earlier "single row only, deliberately no
  // bulk delete" rule, and the guards are the reason it's safe to reverse:
  //   1. REJECTED TAB ONLY. Reject is reversible, delete is not — so the workflow
  //      is reject first, purge second. Two layers (see changeTab and the
  //      guard-2 block at bulkDelete): the UI renders the control on the
  //      Rejected tab only and disarms selection on tab change; the handler
  //      REFUSES the whole operation if any selected row isn't rejected —
  //      never silently deleting a subset.
  //   2. VISIBLE PAGE ONLY. The handler also refuses any selection reaching
  //      beyond the visible page, so "select all N matching" (which spans
  //      pages) can never feed the purge — clearing 12 rejects must never
  //      delete 200 by accident.
  //   3. TYPE THE COUNT. The confirm dialog requires typing the number of rows,
  //      so nothing here can be purged by muscle memory.
  // No guard is decoration; remove one and this becomes the most dangerous
  // control in the console.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleteInput, setBulkDeleteInput] = useState("");
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<number | null>(null);

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
    // ALL-TIME approved counts (a venue absent from the map has 0) — feeds
    // the row summary's "N approved" and the sub-3 "page dormant" note.
    approved: Map<string, number> | null;
    // ALL-TIME pending counts — feeds the ON THE RECORD "N pending" line.
    pending: Map<string, number> | null;
  } | null>(null);
  const [venueBusy, setVenueBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Single expand: at most one venue row open; opening another closes the last.
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  // created_at of the EXPANDED venue's oldest pending row (see the lazy
  // effect below). Null = none / not loaded / failed → the age is omitted.
  const [oldestPendingAt, setOldestPendingAt] = useState<string | null>(null);
  // Sources with ≥1 real scan in the last 30 nights (fixed window — see the
  // quiet-venues effect below). null = unknown (fetch failed / not yet loaded)
  // → the quiet-venues line renders nothing.
  const [scanned30, setScanned30] = useState<Set<string> | null>(null);
  // Venues-tab filter armed by tapping the quiet-venues line above the tabs.
  const [quietOnly, setQuietOnly] = useState(false);
  const takenSlugs = useMemo(
    () => new Set((venuesRows ?? []).map((r) => r.source)),
    [venuesRows],
  );
  // Active venues (null active counts as active, same fail-safe as the rows)
  // with no real scan in the fixed 30-night window. null until BOTH the venues
  // list and the scan counts have loaded — no guessing from partial data.
  const quietVenues = useMemo(
    () =>
      venuesRows && scanned30
        ? venuesRows.filter((r) => r.active !== false && !scanned30.has(r.source))
        : null,
    [venuesRows, scanned30],
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
    // ALL-DIGITS query (with or without a leading #) → EXACT subject-number
    // lookup via admin_find_by_subject instead of the text search: the wall's
    // most prominent identifier is #1461, and _q only matches text, so the
    // read-the-wall → pull-it-in-the-console workflow had no direct route.
    // Tab and venue filters apply client-side so the semantics stay per-tab,
    // exactly like text search (an approved row won't surface on Pending).
    // The date range deliberately does NOT apply: an exact ID lookup that
    // silently missed rows older than the selected window would read as
    // "not found" when the row plainly exists.
    const numMatch = qDebounced.trim().match(/^#?(\d+)$/);
    if (numMatch) {
      safe(rpc("admin_find_by_subject", { _subject_number: Number(numMatch[1]) })).then((res) => {
        if (cancelled) return;
        setListLoading(false);
        if (res.error) {
          if (/authoriz/i.test(res.error.message)) setNotAuthorized(true);
          else setListError(true);
          setRows([]);
          setTotalCount(0);
          return;
        }
        setNotAuthorized(false);
        const found = ((res.data as Confession[]) ?? []).filter(
          (r) => r.status === tab && (venue === "all" || r.source === venue),
        );
        setRows(found);
        setTotalCount(found.length);
      });
      return () => {
        cancelled = true;
      };
    }
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

  // ── Venues overview: all venues + range-scoped scans + all-time approved/pending ──
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
        // select(*) DELIBERATELY: naming prompt_mode here would fail the whole
        // venues read on a database where the venue_prompt_mode migration
        // hasn't landed yet — * tolerates the column's absence in either
        // deploy order (the row type just reads undefined until it exists).
        from("venues").select("*"),
      ).then(
        (r) => r,
        () => ({ data: null, error: { message: "request failed" } }),
      ),
      safe(rpc("admin_scan_counts", rangeArgs)),
      // Approved/pending counts, ALL-TIME (_from null) — deliberately not
      // windowed: the "page dormant" threshold mirrors /record/:venue, which
      // redirects below 3 approved ALL-TIME, so a 7-night count would call
      // live pages dormant whenever the window is narrow. One round trip for
      // ALL venues at once, grouped client-side — never per venue.
      safe(rpc("admin_confession_counts", { _tz: tz, _from: null, _to: null })),
    ]).then(([v, scans, confAll]) => {
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
      const approved = new Map<string, number>();
      const pendingAll = new Map<string, number>();
      if (!confAll.error) {
        for (const r of (confAll.data as ConfCount[]) ?? []) {
          if (r.status === "approved")
            approved.set(r.source, (approved.get(r.source) ?? 0) + num(r.total));
          if (r.status === "pending")
            pendingAll.set(r.source, (pendingAll.get(r.source) ?? 0) + num(r.total));
        }
      }
      setVenueStats({
        scans: scans.error
          ? null
          : new Map(((scans.data as ScanCount[]) ?? []).map((r) => [r.source, num(r.scans)])),
        // null on failure → "—", the scans column's convention. Both all-time
        // (the dormant threshold mirrors /record/:venue, which counts all-time).
        approved: confAll.error ? null : approved,
        pending: confAll.error ? null : pendingAll,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session, rangeArgs, refreshTick]);

  // Oldest pending row's age for the EXPANDED venue — one lazy call per
  // expand, and only when the pending count is non-zero. The list RPC orders
  // newest-first, so the OLDEST row is the last page: offset = count − 1,
  // limit 1. If the aggregate count is momentarily stale and nothing comes
  // back, the age is simply omitted — the pending count still shows.
  useEffect(() => {
    setOldestPendingAt(null);
    if (!session || consoleTab !== "venues" || !expandedVenue) return;
    const n = venueStats?.pending?.get(expandedVenue) ?? 0;
    if (n <= 0) return;
    let cancelled = false;
    safe(
      rpc("admin_list_confessions", {
        _status: "pending",
        _source: expandedVenue,
        _tz: tz,
        _from: null,
        _to: null,
        _include_test: false,
        _limit: 1,
        _offset: Math.max(0, n - 1),
      }),
    ).then((r) => {
      if (cancelled) return;
      const row = ((r.data as Confession[]) ?? [])[0];
      if (!r.error && row?.created_at) setOldestPendingAt(row.created_at);
    });
    return () => {
      cancelled = true;
    };
  }, [session, consoleTab, expandedVenue, venueStats, tz, refreshTick]);

  // ── Quiet venues: ACTIVE venues with no non-test scan in the last 30 nights ──
  // The one thing the console can't show by looking: a QR card that's come off a
  // table. FIXED 30-night window, independent of the range selector — the line's
  // meaning must not change when the filter does. Sources present in the scan
  // counts have ≥1 real scan; active venues absent from it are quiet. A failed
  // fetch resolves to null → the line renders NOTHING (it only exists when there
  // is a KNOWN problem — never an "all good", never an unknown-state banner).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    safe(rpc("admin_scan_counts", { _tz: tz, _from: nightBucketFrom(30), _to: null })).then(
      (res) => {
        if (cancelled) return;
        if (res.error) {
          setScanned30(null);
          return;
        }
        setScanned30(
          new Set(
            (((res.data as ScanCount[]) ?? []).filter((r) => num(r.scans) > 0)).map(
              (r) => r.source,
            ),
          ),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, tz, refreshTick]);

  // Placeholder-sets read — venues + stats tabs (both render register pickers whose
  // descriptions come from this fetch), refetched with the same Retry tick as the
  // venues table. A failed read shows its own inline retry, never blocks venues.
  useEffect(() => {
    if (!session || (consoleTab !== "venues" && consoleTab !== "stats")) return;
    let cancelled = false;
    setRegisterSetsError(false);
    const from = sb.from.bind(sb) as unknown as (table: string) => {
      select(cols: string): PromiseLike<{
        data: { register: string; lines: string[] | null; description: string | null }[] | null;
        error: unknown;
      }>;
    };
    Promise.resolve(from("registers").select("register,lines,description")).then(
      (r) => {
        if (cancelled) return;
        if (r.error || !r.data) {
          setRegisterSetsError(true);
          setRegisterSets(null);
          return;
        }
        setRegisterSets(
          new Map(
            r.data.map((row) => [
              row.register,
              { lines: row.lines ?? [], description: row.description ?? null },
            ]),
          ),
        );
      },
      () => {
        if (cancelled) return;
        setRegisterSetsError(true);
        setRegisterSets(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, consoleTab, refreshTick]);

  // DB description for a register-picker option value ("default" is the UI stand-in
  // for null → DTC). Null while the registers fetch is in flight — pickers just
  // render label-only until it lands.
  const registerDesc = (value: string): string | null =>
    registerSets?.get(value === "default" ? "dtc" : value)?.description ?? null;

  // Direct-channel read (site_copy) — venues tab only, same Retry tick.
  // site_copy is public-read (the confess screen resolves the same row via
  // get_confess_config). select(*) DELIBERATELY: naming prompt_mode would
  // fail the whole read on a database where the direct_prompt_mode migration
  // hasn't landed — * tolerates the column's absence in either deploy order.
  useEffect(() => {
    if (!session || consoleTab !== "venues") return;
    let cancelled = false;
    setSiteCopy(undefined);
    const from = sb.from.bind(sb) as unknown as (table: string) => {
      select(cols: string): PromiseLike<{
        data:
          | {
              key: string;
              value_headline: string | null;
              value_guidance: string | null;
              prompt_mode?: string | null;
              register?: string | null;
            }[]
          | null;
        error: unknown;
      }>;
    };
    Promise.resolve(from("site_copy").select("*")).then(
      (r) => {
        if (cancelled) return;
        const row = r.data?.find((x) => x.key === "default_prompt");
        if (r.error || !row) {
          setSiteCopy(null);
          return;
        }
        setSiteCopy({
          headline: row.value_headline ?? "",
          guidance: row.value_guidance ?? "",
          promptMode: row.prompt_mode ?? null,
          register: row.register ?? null,
        });
      },
      () => {
        if (!cancelled) setSiteCopy(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, consoleTab, refreshTick]);

  // Prompt modes read — venues tab only, same Retry tick as its neighbours.
  // Plain table select: the "admins read prompt_modes" policy (is_admin()-
  // gated) is the console's read path; the table is deliberately not
  // anon-readable and the edge function reads it with the service role.
  // No usage read any more: the captions are venue+direct usage in plain
  // words, derived client-side from venuesRows and site_copy — zero extra
  // queries. (admin_prompt_mode_usage stays in the database, unused here.)
  useEffect(() => {
    if (!session || consoleTab !== "venues") return;
    let cancelled = false;
    setPromptModes(undefined);
    const from = sb.from.bind(sb) as unknown as (table: string) => {
      select(cols: string): PromiseLike<{
        data: { mode: string; version: string }[] | null;
        error: unknown;
      }>;
    };
    Promise.resolve(from("prompt_modes").select("mode,version")).then(
      (r) => {
        if (cancelled) return;
        if (r.error || !r.data) {
          setPromptModes(null);
          return;
        }
        // 'default' first (the norm), then alphabetical.
        setPromptModes(
          [...r.data].sort((a, b) =>
            a.mode === "default" ? -1 : b.mode === "default" ? 1 : a.mode.localeCompare(b.mode),
          ),
        );
      },
      () => {
        if (!cancelled) setPromptModes(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, consoleTab, refreshTick]);

  // Per-mode caption, in plain words: WHO uses this prompt. Venue counts come
  // from venuesRows (null prompt_mode counts toward 'default'); Direct counts
  // toward whichever mode its dropdown stores (site_copy.prompt_mode, null →
  // 'default'). No confession counts here any more — a mode's row is about
  // who's routed to it, and "no venues" on a mode no venue can point at was
  // reading as dead. Null = the reads haven't resolved → no caption, never
  // fake zeros.
  const promptModeCaption = (mode: string): string | null => {
    if (!venuesRows || siteCopy === undefined) return null;
    const venues = venuesRows.filter((v) =>
      mode === "default"
        ? !v.prompt_mode || v.prompt_mode === "default"
        : v.prompt_mode === mode,
    ).length;
    const direct =
      siteCopy !== null &&
      (mode === "default" ? !siteCopy.promptMode || siteCopy.promptMode === "default" : siteCopy.promptMode === mode);
    if (venues === 0 && !direct) return "not in use";
    const venuePart = venues > 0 ? `${venues} venue${venues === 1 ? "" : "s"}` : "";
    if (venues > 0 && direct) return `used by ${venuePart} + direct`;
    if (direct) return "used by direct";
    return `used by ${venuePart}`;
  };

  // Save / add via the admin RPCs. NOT optimistic — a mode's version decides
  // which prompt answers live confessions; local state updates only after the
  // server confirms.
  const savePromptMode = async (mode: string, version: string) => {
    setPromptModeBusy(mode);
    const { error } = await rpc("admin_set_prompt_mode", { _mode: mode, _version: version });
    setPromptModeBusy(null);
    if (error) {
      toast({ title: "Couldn't save prompt mode", description: error.message, variant: "destructive" });
      return;
    }
    setPromptModes((prev) => prev?.map((r) => (r.mode === mode ? { ...r, version } : r)) ?? prev);
    toast({
      title: "Prompt mode saved",
      description: `${mode} → ${version} — live within about a minute.`,
    });
  };

  const addPromptMode = async (mode: string, version: string): Promise<boolean> => {
    setPromptModeBusy("__add__");
    const { error } = await rpc("admin_add_prompt_mode", { _mode: mode, _version: version });
    setPromptModeBusy(null);
    if (error) {
      toast({ title: "Couldn't add prompt mode", description: error.message, variant: "destructive" });
      return false;
    }
    setPromptModes((prev) =>
      prev
        ? [...prev, { mode, version }].sort((a, b) =>
            a.mode === "default" ? -1 : b.mode === "default" ? 1 : a.mode.localeCompare(b.mode),
          )
        : prev,
    );
    toast({ title: "Prompt mode added", description: `${mode} → ${version}` });
    return true;
  };

  // Delete via admin_delete_prompt_mode — the GUARDS live server-side and
  // their raise messages surface here verbatim (same pattern as venue
  // delete): 'default' can never be deleted, and a mode any venue points at
  // refuses, naming the venues. NOT optimistic.
  const deletePromptMode = async (mode: string) => {
    setPromptModeBusy(mode);
    const { error } = await rpc("admin_delete_prompt_mode", { _mode: mode });
    setPromptModeBusy(null);
    if (error) {
      toast({
        title: "Couldn't delete prompt mode",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setPromptModes((prev) => prev?.filter((r) => r.mode !== mode) ?? prev);
    toast({ title: "Prompt mode deleted", description: mode });
  };

  // Save via admin_set_site_copy. NOT optimistic — this copy fronts the live
  // confess screen for all non-venue traffic; local state updates only after the
  // server confirms.
  const saveSiteCopy = async (headline: string, guidance: string) => {
    setSiteCopyBusy(true);
    const { error } = await rpc("admin_set_site_copy", {
      _key: "default_prompt",
      _headline: headline,
      _guidance: guidance,
    });
    setSiteCopyBusy(false);
    if (error) {
      toast({
        title: "Couldn't save the default greeting",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setSiteCopy((prev) => ({
      headline,
      guidance,
      promptMode: prev?.promptMode ?? null,
      register: prev?.register ?? null,
    }));
    toast({
      title: "Default greeting saved",
      description: `${headline} — live on the next confess-screen load.`,
    });
  };

  // The Direct channel's verdict prompt (site_copy.prompt_mode) — the same
  // choice a venue stores in venues.prompt_mode, stored where Direct's other
  // settings already live. NOT optimistic, matching saveSiteCopy: this routes
  // live confessions. null clears → Direct falls back to 'default'.
  const saveDirectPromptMode = async (value: string | null) => {
    setSiteCopyBusy(true);
    const { error } = await rpc("admin_set_direct_prompt_mode", { _prompt_mode: value });
    setSiteCopyBusy(false);
    if (error) {
      toast({
        title: "Couldn't update Direct's verdict prompt",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setSiteCopy((prev) => (prev ? { ...prev, promptMode: value } : prev));
    toast({
      title: "Direct verdict prompt updated",
      description: `Direct → ${value ?? "default"}`,
    });
  };

  // Direct's placeholder register (site_copy.register) — drives the live
  // /confess placeholder set for all no-source traffic via get_confess_config's
  // venue → site_copy → 'dtc' coalesce. Same commit-on-change shape as the
  // venue register; NOT optimistic (routes live traffic).
  const saveDirectRegister = async (value: string) => {
    const next = value === "default" ? null : value;
    if (next === (siteCopy && siteCopy !== null ? siteCopy.register : null)) return;
    setSiteCopyBusy(true);
    const { error } = await rpc("admin_set_direct_register", { _register: next });
    setSiteCopyBusy(false);
    if (error) {
      toast({
        title: "Couldn't update Direct's placeholders",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setSiteCopy((prev) => (prev ? { ...prev, register: next } : prev));
    toast({
      title: "Direct placeholders updated",
      description: `Direct → ${registerLabel(value)}`,
    });
  };

  // Wall funnel read — wall tab only, same Retry tick as the other tab loads.
  useEffect(() => {
    if (!session || consoleTab !== "wall") return;
    let cancelled = false;
    setWallFunnelError(false);
    Promise.resolve(rpc("admin_wall_funnel", { _tz: tz })).then(
      (r) => {
        if (cancelled) return;
        if (r.error || !Array.isArray(r.data)) {
          setWallFunnelError(true);
          setWallFunnel(null);
          return;
        }
        setWallFunnel(r.data as WallFunnelRow[]);
      },
      () => {
        if (cancelled) return;
        setWallFunnelError(true);
        setWallFunnel(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, consoleTab, tz, refreshTick]);

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
  // "Open the queue →" from a venue panel: Moderate tab, THIS venue's filter,
  // Pending sub-tab — landing exactly on what's waiting.
  const openVenueQueue = (source: string) => {
    changeTab("pending");
    changeVenue(source);
    changeConsoleTab("moderate");
  };
  const changeRange = (r: Range) => {
    setRange(r);
    setPage(0);
  };
  const changeTab = (next: Status) => {
    if (next === tab) return;
    setTab(next);
    setPage(0);
    // GUARD 1 of the bulk delete (the UI guard): selection is per-tab IN FACT,
    // not just in spirit — without this, rows selected on Pending ride along
    // to Rejected and sit inside "Delete N permanently". Guard 2 (the status
    // filter in bulkDelete) is the guard that actually holds: a UI guard can
    // be routed around; a handler guard can't.
    setSelected(new Map());
  };

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSending(true);
    const { error } = await sb.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/console` },
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

  // ── HARD delete: permanent row removal via admin_delete_confession. ──
  // Shares NO path with decide(): no optimistic removal (the row leaves the
  // list only after Postgres confirms), no Undo toast (there is nothing to
  // restore from), no chunking (one row at a time by design). The confirm
  // dialog above the call is the only gate — after it, the row is gone.
  const hardDelete = async (row: Confession) => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    const { error } = await safe(rpc("admin_delete_confession", { _id: row.id }));
    setDeleteBusy(false);
    setConfirmDelete(null);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setTotalCount((c) => Math.max(0, c - 1));
    setSelected((prev) => {
      if (!prev.has(row.id)) return prev;
      const next = new Map(prev);
      next.delete(row.id);
      return next;
    });
    setAllMatching((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    if (row.status === "pending")
      setPendingCount((c) => (c === null ? c : Math.max(0, c - 1)));
    toast({ title: `Deleted #${row.subject_number} permanently` });
  };

  // Bulk hard delete. Reuses admin_delete_confession one row at a time rather than
  // adding a bulk RPC: the single-row function is already deployed, already
  // admin-gated, and already proven — a new array-taking function would be a second
  // path to the most destructive operation in the system, pasted by hand.
  //
  // Batched 10 at a time so a few hundred rows don't open a few hundred simultaneous
  // connections. Failures are COUNTED, not thrown: a partial delete must leave the
  // list honest about what actually went, so the rows that failed stay on screen.
  // GUARD 2 of the bulk delete (the guard that actually HOLDS): guard 1
  // (per-tab selection, see changeTab; the control renders on the Rejected
  // tab only) is the UI layer, and a UI layer can be routed around — this
  // handler validation can't. Same two-layer shape as admin_delete_prompt_mode
  // (the UI hides Delete for 'default'; the server refuses it anyway).
  //
  // REFUSAL, not filtering: if ANY selected row isn't rejected, or isn't on
  // the VISIBLE page, the WHOLE operation refuses — a partial delete the
  // person didn't intend is worse than a refusal. The visible-page rule keeps
  // "Select all N matching" (which spans pages) out of the purge: someone
  // clearing 12 rejects must never delete 200 by accident. When valid, the
  // targets ARE the selection, so the count shown, typed, and deleted can
  // never disagree.
  const bulkDeleteEligible = (() => {
    const rows = [...selected.values()];
    if (rows.length === 0) return false;
    const visible = new Set(visibleRows.map((r) => r.id));
    return rows.every((r) => r.status === "rejected" && visible.has(r.id));
  })();
  const bulkDeleteTargets = bulkDeleteEligible ? [...selected.values()] : [];

  const bulkDelete = async () => {
    if (deleteBusy) return;
    const targets = [...selected.values()];
    const visible = new Set(visibleRows.map((r) => r.id));
    if (
      targets.length === 0 ||
      targets.some((r) => r.status !== "rejected" || !visible.has(r.id))
    ) {
      setConfirmBulkDelete(false);
      setBulkDeleteInput("");
      toast({
        title: "Bulk delete refused",
        description:
          "Every selected row must be a rejected confession on this page. Nothing was deleted.",
        variant: "destructive",
      });
      return;
    }
    setDeleteBusy(true);
    setBulkDeleteProgress(0);
    const deletedIds = new Set<string>();
    let failed = 0;
    for (let i = 0; i < targets.length; i += 10) {
      const batch = targets.slice(i, i + 10);
      const results = await Promise.all(
        batch.map((row) =>
          safe(rpc("admin_delete_confession", { _id: row.id })).then((res) => ({ row, res })),
        ),
      );
      for (const { row, res } of results) {
        if (res.error) failed += 1;
        else deletedIds.add(row.id);
      }
      setBulkDeleteProgress(Math.min(targets.length, i + batch.length));
    }
    setDeleteBusy(false);
    setBulkDeleteProgress(null);
    setConfirmBulkDelete(false);
    setBulkDeleteInput("");

    // Prune every list that could still be holding a now-dead row.
    setRows((prev) => prev.filter((r) => !deletedIds.has(r.id)));
    setAllMatching((prev) => (prev ? prev.filter((r) => !deletedIds.has(r.id)) : prev));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });
    setTotalCount((c) => Math.max(0, c - deletedIds.size));
    // No pendingCount adjustment: the refusal guard means every deleted row
    // was rejected — a pending row can never reach this point.

    if (failed) {
      toast({
        title: `Deleted ${deletedIds.size}, ${failed} failed`,
        description: "The rows that failed are still listed and still selected.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Deleted ${deletedIds.size} permanently` });
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

  // Venue tag on/off for ONE confession: writes confessions.stamp_venue, which is
  // what decides whether the share card prints "AS CHARGED AT <VENUE>" or
  // "LOCATION WITHHELD". Same optimistic-flip + revert pattern as toggleFeatured.
  //
  // It does NOT touch row.source. source drives the venue counts, the venue wall
  // and the venue report — hiding a name must never cost the attribution behind it.
  //
  // NULL counts as ON: rows written before the column existed have null and print
  // the venue today, so the first click on those must turn the tag OFF, not on.
  const toggleStampVenue = async (row: Confession) => {
    const next = row.stamp_venue === false; // null/true -> false, false -> true
    setBusyId(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stamp_venue: next } : r)));
    const { error } = await rpc("admin_set_stamp_venue", { target_id: row.id, value: next });
    setBusyId(null);
    if (error) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, stamp_venue: row.stamp_venue } : r)),
      );
      toast({ title: "Couldn't update venue tag", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Venue tag on" : "Venue tag off",
      description: `#${row.subject_number} — ${next ? venueDisplayName("", row.source) || row.source : "LOCATION WITHHELD"}`,
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

  // Preview placeholder lines for a register: the DB set when loaded and
  // non-empty, the hardcoded fail-safe set otherwise — the same resolution
  // order the live confess screen uses. "default" is the UI stand-in for
  // null → DTC (same convention as registerDesc).
  const linesForRegister = (register: string): string[] => {
    const reg = register === "default" ? "dtc" : register;
    const db = registerSets?.get(reg)?.lines?.filter((l) => l.trim() !== "");
    return db && db.length > 0 ? db : getPlaceholderLines(reg);
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

  // Per-venue verdict prompt (venues.prompt_mode) — same optimistic pattern as
  // the register. null = "use the default mode" (the RPC clears the column).
  const overviewSetPromptMode = async (source: string, value: string | null) => {
    const prev = venuesRows?.find((r) => r.source === source)?.prompt_mode ?? null;
    if (value === prev) return;
    setVenueBusy(source);
    patchVenueRow(source, { prompt_mode: value });
    const { error } = await rpc("admin_set_venue_prompt_mode", {
      _source: source,
      _prompt_mode: value,
    });
    setVenueBusy(null);
    if (error) {
      patchVenueRow(source, { prompt_mode: prev });
      toast({
        title: "Couldn't update verdict prompt",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Verdict prompt updated",
      description: `${venueDisplayName("", source) || source} → ${value ?? "default"}`,
    });
  };

  // Rename (display name only — the SLUG is permanent: printed on QR cards and
  // the attribution key on every historical row). NOT optimistic: identity
  // fronts reports and share cards, so local state updates only after the
  // server confirms.
  const overviewRenameVenue = async (source: string, name: string) => {
    const next = name.trim();
    const prev = venuesRows?.find((r) => r.source === source)?.display_name ?? "";
    if (!next || next === prev) return;
    setVenueBusy(source);
    const { error } = await rpc("admin_set_venue_display_name", {
      _source: source,
      _display_name: next,
    });
    setVenueBusy(null);
    if (error) {
      toast({ title: "Couldn't rename venue", description: error.message, variant: "destructive" });
      return;
    }
    patchVenueRow(source, { display_name: next });
    toast({ title: "Venue renamed", description: `${source} → ${next}` });
  };

  // Save a placeholder set via admin_set_register_lines. NOT optimistic — the set
  // feeds the live confess screen, so local state updates only after the server
  // confirms; success/failure both land as a toast.
  const saveRegisterSet = async (register: string, label: string, lines: string[]) => {
    setRegisterSetBusy(register);
    const { error } = await rpc("admin_set_register_lines", {
      _register: register,
      _lines: lines,
    });
    setRegisterSetBusy(null);
    if (error) {
      toast({
        title: "Couldn't save placeholder set",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setRegisterSets((prev) => {
      const next = new Map(prev ?? []);
      next.set(register, {
        lines,
        description: prev?.get(register)?.description ?? null,
      });
      return next;
    });
    toast({
      title: "Placeholder set saved",
      description: `${label} — live on the next confess-screen load.`,
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
  // The share line ("M of those were shared") is the number a venue cares about
  // most — used it vs. sent it to their friends. It is OMITTED when zero (a venue
  // reading "0" is worse than not seeing the line) and OMITTED when the count
  // query fails (a report missing one line beats no report).
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
    // Shares by venue over the SAME window as the confession fetch (rangeArgs):
    // the deployed windowed admin_share_counts(_tz,_from,_to) overload, already
    // test-filtered by source — the exact call the Stats rollup makes.
    const sharedCount = await safe(rpc("admin_share_counts", rangeArgs)).then((res) => {
      if (res.error) return 0;
      const mine = ((res.data as ShareCount[]) ?? []).find((s) => s.source === source);
      return Number(mine?.shares ?? 0) || 0;
    });
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
      `${n} guests confessed` +
        (sharedCount > 0 ? `\n${sharedCount} of those were shared` : ""),
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

        {/* Quiet venues — the ONLY thing in the console that says a QR card is
            no longer on a table; everything else is visible by looking. Renders
            NOTHING unless there's a problem (no "all good", no empty state, and
            nothing while either fetch is unresolved). A note, not a banner —
            plain mono, tap filters the Venues tab to the quiet ones. */}
        {quietVenues && quietVenues.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuietOnly(true);
              changeConsoleTab("venues");
            }}
            className="block text-left font-mono-light text-[11px] tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            {quietVenues.length} venue{quietVenues.length === 1 ? "" : "s"} · no scan in 30
            days
          </button>
        ) : null}

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
                disabled={consoleTab === "wall"}
              >
                {r === "all" ? "All" : `${r} nights`}
              </Button>
            ))}
          </div>
          <Select
            value={venue}
            onValueChange={changeVenue}
            disabled={consoleTab === "venues" || consoleTab === "wall"}
          >
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
            Channels{venuesRows ? ` · ${venuesRows.length + 1}` : ""}
          </Button>
          <Button
            size="sm"
            variant={consoleTab === "stats" ? "secondary" : "ghost"}
            onClick={() => changeConsoleTab("stats")}
          >
            Stats
          </Button>
          <Button
            size="sm"
            variant={consoleTab === "wall" ? "secondary" : "ghost"}
            onClick={() => changeConsoleTab("wall")}
          >
            Wall
          </Button>
        </div>

        {/* ── VENUES TAB — channels: Direct + every venue as a row. ── */}
        {consoleTab === "venues" ? (
        <>
        {/* The old standalone "Default greeting (no venue)" section is GONE —
            it was the Direct channel's settings panel without a name, missing
            its second half. It now lives as the FIRST ROW of the Channels
            list below (DirectChannelRow), with the same greeting editor plus
            the verdict-prompt half a venue gets. */}

        {/* Prompt modes — which pinned prompt version answers each confession
            mode (prompt_modes; the edge function reads it on a 60s cache with
            a hardcoded floor if unreachable). On THIS tab, not its own tab:
            the console's other global config — the default greeting above and
            the register sets below — already lives here, and a dedicated tab
            for a two-row table is navigation furniture. */}
        <section className="rounded-lg border border-border px-4 py-3">
          <p className="text-sm font-medium">Prompt modes</p>
          {/* Both cautions are quiet lines, not modals or confirms — these are
              deliberate actions taken rarely; they need stating once, not
              guarding against. The second line sits here because every version
              field in the list shares it. */}
          <p className="text-xs text-muted-foreground">
            A change affects every confession using that mode within about a minute.
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Versions must exist in OpenAI. A version that doesn't will fail every confession
            using its mode.
          </p>
          {promptModes === undefined ? (
            <p className="py-2 text-sm text-muted-foreground">Loading…</p>
          ) : promptModes === null ? (
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground">Couldn't load prompt modes.</p>
              <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {/* 'dtc' is HIDDEN from this list, not deleted: the row stays in
                  the database as the Direct channel's compatibility shim (the
                  client's mount-time marker + older deployed clients resolve
                  through it). It isn't a peer of the prompt styles — Prompt
                  modes is the LIBRARY of prompts; the Channels list above is
                  who gets which. Showing it here read as a dead row ("no
                  venues" forever, by design) and invited deletion. */}
              {promptModes
                .filter((r) => r.mode !== "dtc")
                .map((r) => (
                  <PromptModeRow
                    key={`${r.mode}\n${r.version}`}
                    mode={r.mode}
                    initialVersion={r.version}
                    busy={promptModeBusy === r.mode}
                    caption={promptModeCaption(r.mode)}
                    onSave={(v) => savePromptMode(r.mode, v)}
                    onDelete={r.mode === "default" ? undefined : () => deletePromptMode(r.mode)}
                  />
                ))}
              <AddPromptModeRow
                busy={promptModeBusy === "__add__"}
                taken={promptModes.map((r) => r.mode)}
                onAdd={addPromptMode}
              />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setOverviewOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
          >
            {/* Channels, not "Venues": Direct is a channel too — the +1.
                Where confessions come from, venue or not. */}
            <span>Channels{venuesRows ? ` · ${venuesRows.length + 1}` : ""}</span>
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
                    Where confessions come from. Scans:{" "}
                    {RANGE_LABELS[range].toLowerCase()}; approved counts are all-time. Blank
                    headline → default prompt.
                  </p>
                  {/* Armed by the quiet-venues line above the tabs. The filter
                      only applies while quietVenues is resolvable — if either
                      fetch degrades, the full list shows rather than hiding
                      venues on unknown data. */}
                  {quietOnly && quietVenues ? (
                    <p className="pt-1 font-mono-light text-[11px] tracking-wide text-muted-foreground/70">
                      Showing venues with no scan in 30 days ·{" "}
                      <button
                        type="button"
                        onClick={() => setQuietOnly(false)}
                        className="underline underline-offset-2 hover:text-foreground transition-colors"
                      >
                        Show all
                      </button>
                    </p>
                  ) : null}
                  <ul className="divide-y divide-border">
                    {/* Direct first — see DirectChannelRow for why it's a
                        CHANNEL here rather than a Prompt modes row. Not
                        subject to the quiet-venues filter (it has no scans
                        to go quiet). */}
                    <DirectChannelRow
                      siteCopy={siteCopy}
                      busy={siteCopyBusy}
                      promptModes={promptModes}
                      onSaveGreeting={saveSiteCopy}
                      onPromptMode={saveDirectPromptMode}
                      onRegister={saveDirectRegister}
                      registerDesc={registerDesc}
                      linesFor={linesForRegister}
                      onRetry={() => setRefreshTick((t) => t + 1)}
                    />
                    {(sortedVenueRows ?? [])
                      .filter(
                        (row) =>
                          !quietOnly ||
                          !quietVenues ||
                          quietVenues.some((q) => q.source === row.source),
                      )
                      .map((row) => (
                      <VenueOverviewRow
                        key={row.source}
                        registerDesc={registerDesc}
                        row={row}
                        scans={venueStats?.scans ? (venueStats.scans.get(row.source) ?? 0) : null}
                        approved={
                          venueStats?.approved ? (venueStats.approved.get(row.source) ?? 0) : null
                        }
                        pending={
                          venueStats?.pending ? (venueStats.pending.get(row.source) ?? 0) : null
                        }
                        oldestPendingAt={expandedVenue === row.source ? oldestPendingAt : null}
                        onOpenQueue={() => openVenueQueue(row.source)}
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
                        promptModes={promptModes}
                        onPromptMode={(v) => overviewSetPromptMode(row.source, v)}
                        onRename={(name) => overviewRenameVenue(row.source, name)}
                        linesFor={linesForRegister}
                        defaultGreeting={siteCopy}
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
                    registerDesc={registerDesc}
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

        {/* Placeholder sets — the CONTENT behind the register picker above. Same
            collapsible-section shell as Venues. */}
        <section className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setRegisterSetsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium"
          >
            <span>Placeholder sets</span>
            <span className="text-xs text-muted-foreground">
              {registerSetsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {registerSetsOpen ? (
            <div className="border-t border-border px-4 pb-2">
              {registerSetsError ? (
                <div className="space-y-2 py-3">
                  <p className="text-sm text-muted-foreground">Couldn't load placeholder sets.</p>
                  <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                    Retry
                  </Button>
                </div>
              ) : !registerSets ? (
                <p className="py-3 text-sm text-muted-foreground">Loading placeholder sets…</p>
              ) : (
                <>
                  <p className="pt-2 text-xs text-muted-foreground">
                    The rotating /confess example lines per register. Exactly six lines, max{" "}
                    {REGISTER_LINE_MAX} chars each. Saves go live on the next confess-screen
                    load; if this table is ever unreachable the app falls back to its built-in
                    copies.
                  </p>
                  <div className="divide-y divide-border">
                    {REGISTER_SET_META.map(({ key, label }) => (
                      <RegisterSetEditor
                        key={`${key}:${(registerSets.get(key)?.lines ?? []).join("\n")}`}
                        label={label}
                        description={registerSets.get(key)?.description ?? null}
                        initial={registerSets.get(key)?.lines ?? []}
                        busy={registerSetBusy === key}
                        onSave={(lines) => saveRegisterSet(key, label, lines)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
        </>
        ) : null}

        {/* ── WALL TAB — the funnel + the two wall numbers. Fixed 7-night windows,
            current vs previous; nothing else by design (no charts, no pickers). ── */}
        {consoleTab === "wall" ? (
        <section className="rounded-lg border border-border p-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Last 7 nights vs the 7 before. Fixed windows, 4am night cutoff, test sessions
            excluded.
          </p>
          {/* Moderation happens one row at a time, so the only thing Moderate
              structurally can't show is how approved verdicts read AS A PAGE —
              three in a row opening the same way, two on the same topic, four
              flexes with no change of pace. The wall is the only place that's
              visible. (Deliberately NOT admin controls on /thewall itself:
              that ships admin code to every public visitor for a convenience
              the search box already covers — search "#1461" instead.) */}
          <a
            href="/thewall"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Open the wall →
          </a>
          {wallFunnelError ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Couldn't load the funnel.</p>
              <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
                Retry
              </Button>
            </div>
          ) : !wallFunnel ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            (() => {
              const cur = wallFunnel.find((r) => r.period === "current");
              const prev = wallFunnel.find((r) => r.period === "previous");
              return (
                <>
                  <div className="space-y-2">
                    <FunnelLine
                      title="Last 7"
                      scans={num(cur?.scans)}
                      confessions={num(cur?.confessions)}
                      shares={num(cur?.shares)}
                      offenceTaps={num(cur?.offence_taps)}
                      wallViews={num(cur?.wall_views)}
                      bright
                    />
                    <FunnelLine
                      title="Prev 7"
                      scans={num(prev?.scans)}
                      confessions={num(prev?.confessions)}
                      shares={num(prev?.shares)}
                      offenceTaps={num(prev?.offence_taps)}
                      wallViews={num(prev?.wall_views)}
                    />
                  </div>
                  {/* Six blocks. Rates reuse stagePct (zero denominator → "—").
                      "Landed cold" = the wall was the session's FIRST touch of the
                      site; "via booth" = the session passed the consent gate first
                      (SEE THE RECORD clicks — the event type is still see_guilty). Pre-attribution rows have no arrival,
                      so the two arrival buckets can sum below total visits. */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Wall visits",
                        cur: String(num(cur?.wall_views)),
                        prev: String(num(prev?.wall_views)),
                      },
                      {
                        label: "Stayed 15s+",
                        cur: String(num(cur?.wall_engaged)),
                        prev: String(num(prev?.wall_engaged)),
                      },
                      {
                        label: "From Instagram — landed cold",
                        cur: String(num(cur?.wall_ig_direct)),
                        prev: String(num(prev?.wall_ig_direct)),
                      },
                      {
                        label: "Returning — % of visits",
                        cur: stagePct(num(cur?.wall_returning), num(cur?.wall_views)),
                        prev: stagePct(num(prev?.wall_returning), num(prev?.wall_views)),
                      },
                      {
                        label: "Stayed 15s+ — landed cold",
                        cur: stagePct(num(cur?.wall_engaged_direct), num(cur?.wall_direct)),
                        prev: stagePct(num(prev?.wall_engaged_direct), num(prev?.wall_direct)),
                      },
                      {
                        label: "Stayed 15s+ — via booth",
                        cur: stagePct(num(cur?.wall_engaged_internal), num(cur?.wall_internal)),
                        prev: stagePct(num(prev?.wall_engaged_internal), num(prev?.wall_internal)),
                      },
                    ].map((b) => (
                      <div key={b.label} className="rounded-md border border-border px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {b.label}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {b.cur}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            · prev {b.prev}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()
          )}
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
                        <div>
                          {o.label}
                          {registerDesc(o.value) ? (
                            <span className="block text-[10px] text-muted-foreground">
                              {registerDesc(o.value)}
                            </span>
                          ) : null}
                        </div>
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
              placeholder="Search text or #number…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="h-8 min-w-40 flex-1 text-xs"
            />
          </div>

          {/* Keyboard hints — the shortcuts have existed since the queue was
              built but were undocumented in the UI. Full wiring: ↑/↓ are J/K
              aliases, and R also un-approves on the Approved tab; the hint
              stays to the four everyday ones. */}
          <p className="font-mono-light text-[10px] tracking-wide text-muted-foreground/60">
            A approve · R reject · J K move · F feature
          </p>

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
              <ReelBulkAction rows={Array.from(selected.values())} />
              {/* Bulk delete: REJECTED TAB ONLY, and the quietest control in the
                  bar — plain underlined text, no button chrome, same treatment as
                  the per-row Delete. Everything else here is reversible; this is
                  the one that isn't, so it must not look like its neighbours. */}
              {tab === "rejected" ? (
                <button
                  type="button"
                  disabled={bulkBusy || deleteBusy || !bulkDeleteEligible}
                  title={
                    bulkDeleteEligible
                      ? undefined
                      : "Only rejected rows on this page can be bulk-deleted — trim the selection."
                  }
                  onClick={() => {
                    setBulkDeleteInput("");
                    setConfirmBulkDelete(true);
                  }}
                  className="text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors underline underline-offset-2 disabled:opacity-50"
                >
                  Delete {selected.size} permanently
                </button>
              ) : null}
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

          {/* BULK hard-delete confirmation. Deliberately harder to clear than any
              other dialog in the console: the action stays disabled until the
              exact row count is typed. Every other bulk action here is undoable
              for a few seconds; this one has nothing behind it. The typed count
              is what stops "select all 228 matching" being purged by reflex. */}
          <AlertDialog
            open={confirmBulkDelete}
            onOpenChange={(o) => {
              if (!o && !deleteBusy) {
                setConfirmBulkDelete(false);
                setBulkDeleteInput("");
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                {/* Every number in this dialog derives from bulkDeleteTargets —
                    the SAME filtered list the handler deletes — so the count
                    shown, the count typed, and the count deleted can never
                    disagree (guard 2's honesty requirement). */}
                <AlertDialogTitle>
                  Delete {bulkDeleteTargets.length} confessions permanently?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This can't be undone — there is no restore and no undo toast. Any
                  share links to these confessions will 404, and the venue counts
                  will drop. Card images already shared stay cached on Instagram and
                  Messages for days, so deleting does not remove what's already out
                  there.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Type <span className="font-mono text-foreground">{bulkDeleteTargets.length}</span>{" "}
                  to confirm.
                </p>
                <Input
                  value={bulkDeleteInput}
                  onChange={(e) => setBulkDeleteInput(e.target.value)}
                  disabled={deleteBusy}
                  inputMode="numeric"
                  autoFocus
                  className="font-mono"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    deleteBusy || bulkDeleteInput.trim() !== String(bulkDeleteTargets.length)
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    // The dialog must NOT auto-close: it stays open showing progress
                    // while a few hundred sequential deletes run.
                    e.preventDefault();
                    bulkDelete();
                  }}
                >
                  {bulkDeleteProgress === null
                    ? `Delete ${bulkDeleteTargets.length}`
                    : `Deleting ${bulkDeleteProgress}/${bulkDeleteTargets.length}…`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Hard-delete confirmation. The three consequences live HERE — at
              the moment of the click — rather than beside the button: beside
              the button they'd be furniture, read once and never again; in
              the dialog they interrupt every single delete. The OG-cache line
              matters most: if the reason for deleting is legal, deletion does
              not remove what's already out there. */}
          <AlertDialog
            open={!!confirmDelete}
            onOpenChange={(o) => {
              if (!o) setConfirmDelete(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete #{confirmDelete?.subject_number} permanently?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      The row is deleted from the database permanently. It cannot
                      be restored — there is no undo.
                    </p>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        Any shared /v/ link for this confession will show "This
                        record doesn't exist."
                      </li>
                      <li>The public record's count and the console funnel both drop.</li>
                      <li>
                        Instagram and Messages keep the link-preview card cached
                        for days — the confession stays visible in previews even
                        after deletion. Deleting does not remove what's already
                        out there.
                      </li>
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteBusy}
                  onClick={() => {
                    if (confirmDelete) hardDelete(confirmDelete);
                  }}
                >
                  Delete permanently
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
                    {/* Content column + action ROW beneath it — the old right-hand
                        action column held every row open to the stack's height
                        (~210px) no matter how short the confession; the row is
                        now content-height. Hierarchy: the VERDICT is the row's
                        largest text (it's what the decision is about); the
                        confession is mono + muted context above it; metadata is
                        one dim line, subject number in State Blue. */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="text-[hsl(var(--state-blue)/0.75)]">
                          #{row.subject_number}
                        </span>
                        <SourceBadge source={row.source} />
                        <TopicBadge topic={row.topic} />
                        {/* Prompt-mode marker — only for a mode that is NEITHER
                            'default' NOR 'solo': a venue mode, an experiment,
                            anything genuinely different. 'solo' is unmarked BY
                            DECISION (7 Aug 2026), not oversight — the mode
                            backfill stamped every historical row 'solo', so
                            marking non-default would badge the entire queue,
                            inverting "the norm is unmarked" while telling you
                            nothing (those rows predate modes entirely). The
                            column keeps the distinction for queries; the badge
                            exists only to catch the unusual. Do NOT "simplify"
                            this condition to a single comparison. */}
                        {row.mode && row.mode !== "default" && row.mode !== "solo" ? (
                          <span className="uppercase tracking-wide">{row.mode}</span>
                        ) : null}
                        {flagged ? (
                          <span className="rounded bg-amber-500/15 text-amber-500 px-1.5 py-0.5 text-[11px] font-medium">
                            review
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap font-mono-light text-xs text-muted-foreground">
                        {row.confession_text}
                      </p>
                      {row.verdict_text ? (
                        <p className="whitespace-pre-wrap text-[15px] text-foreground">
                          {row.verdict_text}
                        </p>
                      ) : null}
                      {/* Action row. Decisions LEFT (Approve outlined in ritual
                          green; Reject a plain grey outline — red exists nowhere
                          else in the app, and position teaches which is which).
                          The spacer pushes ☆ / Reel / Delete RIGHT: Reel isn't
                          moderation — it works on any tab and doesn't need
                          approval — so it must not sit beside the decisions. */}
                      <div className="flex items-center gap-2 pt-1.5">
                        {tab === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-ritual/40 text-ritual hover:bg-ritual/10 hover:text-ritual"
                              disabled={bulkBusy}
                              onClick={() => decide([row], "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
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
                            variant="outline"
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
                        <div className="ml-auto flex items-center gap-2">
                          {/* Feature: icon only — a reversible toggle, and ☆
                              reads as favourite universally. aria-pressed +
                              title kept so it stays identifiable. */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            aria-pressed={!!row.homepage_featured}
                            title={
                              row.homepage_featured
                                ? "Featured on homepage — click to remove"
                                : "Feature on homepage"
                            }
                            onClick={() => toggleFeatured(row)}
                            className={cn(
                              "w-9 px-0",
                              row.homepage_featured ? "text-ritual" : "text-muted-foreground",
                            )}
                          >
                            {row.homepage_featured ? "★" : "☆"}
                          </Button>
                          {/* Venue tag. KEEPS A WORD rather than an icon: ☆
                              reads as favourite everywhere, but no glyph means
                              "print the venue name on the card" — an icon here
                              would be guessed wrong. Ritual green = the name
                              prints; muted = LOCATION WITHHELD.
                              Only rendered when there IS a venue to tag —
                              source 'direct' (and anything venues.json doesn't
                              know) has no name to print, so the control would
                              be a no-op the moderator still has to read past. */}
                          {row.source &&
                          row.source !== "direct" &&
                          venueDisplayName("", row.source) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.id}
                              aria-pressed={row.stamp_venue !== false}
                              title={
                                row.stamp_venue === false
                                  ? "Venue name hidden (LOCATION WITHHELD) — click to show"
                                  : `Card prints ${venueDisplayName("", row.source)} — click to hide`
                              }
                              onClick={() => toggleStampVenue(row)}
                              className={cn(
                                "px-2 text-[11px]",
                                row.stamp_venue !== false ? "text-ritual" : "text-muted-foreground",
                              )}
                            >
                              {/* The WORD is the signal ("Named"/"Withheld"),
                                  colour only reinforces it — a colour-only
                                  toggle sat next to the green source badge,
                                  which means something different (where the
                                  confession came from, not whether the name
                                  prints). Two greens competing. */}
                              {row.stamp_venue !== false ? "Named" : "Withheld"}
                            </Button>
                          ) : null}
                          {/* Reel KEEPS its label + Queued state: it starts a
                              render on the Mac via booth_watch.py, and the
                              Queued text is the only confirmation the clipboard
                              write worked. Never a bare icon. */}
                          <ReelAction row={row} />
                          {/* HARD delete — quietest control in the row: plain
                              11px underlined text, no chrome, and it keeps its
                              LABEL (✕ reads as "close", the wrong meaning).
                              Mis-hitting the decisions is reversible; this is
                              not, so it should take a fraction longer to find.
                              Renders in ALL THREE tabs (this row is shared).
                              The confirm dialog below carries the consequences. */}
                          <button
                            type="button"
                            disabled={deleteBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(row);
                            }}
                            className="text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors underline underline-offset-2 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
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
