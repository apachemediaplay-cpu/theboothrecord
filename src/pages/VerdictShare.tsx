import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSharedVerdict, logBoothEvent, type SharedVerdict } from "@/lib/metrics";
import { venueDisplayName, mayStampVenue, resolveVenueDisplayName } from "@/lib/source";

// The Booth mark — STATIC by design: this page is read, not passed through, and
// YOUR TURN's label already carries the page's only pulse. No glow, no animation
// of any kind; the dot stays inside the SVG (no box-shadow), unlike the gate.
// marginClass: the found state uses the default mb-8 (32px); the notfound state
// passes mb-4 so its container's gap-4 stacks to the SAME 32px — one number.
const BoothMark = ({ marginClass = "mb-8" }: { marginClass?: string }) => (
  <svg viewBox="0 0 240 240" className={`${marginClass} h-10 w-10`} aria-hidden="true">
    <path
      d="M58.5 210 L58.5 109 A61.5 61.5 0 0 1 181.5 109 L181.5 210"
      fill="none"
      stroke="hsl(var(--ritual-green))"
      strokeWidth="31"
    />
    <rect x="32" y="210" width="175" height="18" fill="hsl(var(--ritual-green))" />
    <circle cx="120" cy="161" r="19" fill="hsl(var(--ritual-green))" />
  </svg>
);

// Public landing for a shared verdict link (/v/:id). A recipient — not the confessor —
// lands here. Reads the verdict by its unguessable uuid via get_share_verdict; an unknown
// or non-uuid id resolves to nothing and shows the not-found state. No names, venue only.
const VerdictShare = () => {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "found" | "notfound">("loading");
  const [row, setRow] = useState<SharedVerdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchSharedVerdict(id).then((r) => {
      if (cancelled) return;
      setRow(r);
      setStatus(r ? "found" : "notfound");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // CTA carries the venue source so a scan-through from the shared link still attributes.
  const source = row?.source ?? "";
  const ctaHref =
    source && source !== "direct" ? `/confess?source=${encodeURIComponent(source)}` : "/confess";
  // FAIL CLOSED: only an explicit stamp_venue === true shows the venue. A missing field (older
  // get_share_verdict), a null row, or a failed fetch all fall through to "" → the existing
  // "Location withheld". Name resolution: venues.json synchronously at render (existing
  // venues — unchanged, no DB call, no flash), with the active-only DB fallback for
  // console-added venues filling in async. Any fallback failure → "" → withheld.
  const syncVenue = mayStampVenue(row?.stamp_venue) ? venueDisplayName("", source) : "";
  const [dbVenue, setDbVenue] = useState("");
  useEffect(() => {
    setDbVenue(""); // never carry a stale name across row changes
    if (!mayStampVenue(row?.stamp_venue)) return; // stamp not permitted — no lookup at all
    if (venueDisplayName("", source)) return; // venues.json covers it — DB fallback never runs
    let cancelled = false;
    resolveVenueDisplayName(source).then((name) => {
      if (!cancelled) setDbVenue(name);
    });
    return () => {
      cancelled = true;
    };
  }, [row, source]);
  const venue = syncVenue || dbVenue;

  if (status === "loading") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ritual text-lg font-mono-light tracking-wide">Pulling the record…</p>
        </div>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <BoothMark marginClass="mb-4" />
          <p className="text-muted-foreground text-base font-mono-light">This record doesn't exist.</p>
        </div>
        {/* THE PRIMARY-ACTION RULE (see index.css) applies here too — same primary
            action, same slot; a dead share link must not surface a button style
            that exists nowhere else in the app. */}
        {/* max-w-md mx-auto: the FIXED block escapes screen-container's column
            (fixed spans the viewport) — same cap as the gate's BEGIN block and
            every action screen, so the button matches the found state's. */}
        <div className="fixed bottom-32 left-0 right-0 mx-auto max-w-md flex justify-center px-6">
          <Link
            to="/confess"
            className="btn-booth border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
          >
            <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
              ENTER THE BOOTH →
            </span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        <BoothMark />
        {/* System stamp, not a headline — Verdict's treatment but UPPERCASE: this reader
            is a stranger arriving cold, and caps read as a document stamp. */}
        {/* Masthead rhythm: 32px above this stamp (the mark is a heading), 12px
            below it (stamp + confession are one block). */}
        <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] uppercase mb-3">
          The booth noticed.
        </p>
        {row?.confession_text ? (
          <p className="text-muted-foreground text-base font-mono-light whitespace-pre-wrap mb-8">
            {row.confession_text}
          </p>
        ) : null}
        {/* 24px to the venue line below — metadata attached to the verdict, not a
            peer of it; keeps confession → verdict (32px) the widest gap in the
            record. */}
        <p className="font-control font-bold text-[#F4F0EA] text-2xl md:text-3xl leading-tight mb-6">
          {row?.verdict_text}
        </p>
        {/* Filing line in State Blue — the app's metadata colour, matching the
            wall's stamps. (The share CARD keeps its own palette — see card.mjs.) */}
        <p className="text-[hsl(var(--state-blue)/0.75)] text-xs font-mono-light tracking-[0.2em] uppercase">
          {venue ? `As charged at ${venue}` : "Location withheld"}
          {row?.subject_number ? ` · Subject #${row.subject_number}` : ""}
        </p>
      </div>

      {/* Hairline rule — same treatment as the Verdict screen — separating the record
          above (left-aligned) from the actions below (centred). */}
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-3">
        {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
            hairline (muted-foreground/40, the divider's own rule),
            transparent — the glow is the only colour in the box. The
            emphasis on THIS page is entering, not
            the shop — no FIRST OFFENCE here at all (it lives on
            Verdict's post-share state; a cold stranger gets pushed into the
            Booth, not to a $55 buy link). */}
        <Link
          to={ctaHref}
          className="btn-booth border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
        >
          <span className="enter-glow-text text-[hsl(var(--ritual-green))]">YOUR TURN →</span>
        </Link>
        {/* Quiet exit below the box — NO arrow (the arrow belongs to YOUR TURN
            alone). Same wallLink treatment as Verdict's quiet exit. onClick is a
            fire-and-forget metric; Link handles the navigation. The LABEL is
            SEE THE RECORD (the wall is PUBLIC RECORD now) but the logged event
            type stays see_guilty — it's in the log_booth_event RPC whitelist,
            and renaming it would need a migration for no benefit. */}
        <Link
          to="/thewall"
          onClick={() => logBoothEvent("see_guilty", source, { from: "share" })}
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          SEE THE RECORD
        </Link>
      </div>
    </main>
  );
};

export default VerdictShare;
