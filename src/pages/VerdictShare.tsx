import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { fetchSharedVerdict, type SharedVerdict } from "@/lib/metrics";
import { venueDisplayName, mayStampVenue, resolveVenueDisplayName } from "@/lib/source";

// The Booth mark — STATIC by design: this page is read, not passed through, and the
// FIRST OFFENCE link already carries the page's only pulse. No glow, no animation of
// any kind; the dot stays inside the SVG (no box-shadow), unlike the gate.
const BoothMark = () => (
  <svg viewBox="0 0 240 240" className="mb-5 h-10 w-10" aria-hidden="true">
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
        <BoothFooter />
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="screen-container animate-fade-in">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <BoothMark />
          <p className="text-muted-foreground text-base font-mono-light">This record doesn't exist.</p>
        </div>
        <div className="fixed bottom-32 left-0 right-0 flex justify-center px-6">
          <Link to="/confess" className="btn-booth text-center">
            ENTER THE BOOTH →
          </Link>
        </div>
        <BoothFooter />
      </main>
    );
  }

  return (
    <main className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        <BoothMark />
        {/* System stamp, not a headline — Verdict's treatment but UPPERCASE: this reader
            is a stranger arriving cold, and caps read as a document stamp. */}
        <p className="text-ritual text-[9px] font-mono-light tracking-[0.2em] uppercase mb-6">
          The booth noticed.
        </p>
        {row?.confession_text ? (
          <p className="text-muted-foreground text-base font-mono-light whitespace-pre-wrap mb-8">
            {row.confession_text}
          </p>
        ) : null}
        <p className="font-control font-bold text-[#F4F0EA] text-2xl md:text-3xl leading-tight mb-8">
          {row?.verdict_text}
        </p>
        <p className="text-muted-foreground/60 text-xs font-mono-light tracking-[0.2em] uppercase">
          {venue ? `As charged at ${venue}` : "Location withheld"}
          {row?.subject_number ? ` · Subject #${row.subject_number}` : ""}
        </p>
      </div>

      {/* Hairline rule — same treatment as the Verdict screen — separating the record
          above (left-aligned) from the actions below (centred). */}
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-3">
        <p className="text-ritual text-[11px] font-mono-light tracking-wide text-center">
          Your turn.
        </p>
        <Link to={ctaHref} className="btn-booth text-[11px] text-center">
          ENTER THE BOOTH →
        </Link>
        <a
          href="https://houseofguilty.com/contraband?source=booth-share"
          target="_blank"
          rel="noopener"
          className="mt-4 text-[11px] font-mono-light tracking-wide"
        >
          <span className="text-muted-foreground">Reoffend.</span>{" "}
          <span className="offence-glow-text text-[#FF4800] hover:opacity-80 transition-colors">
            THE FIRST OFFENCE — $55
          </span>
        </a>
      </div>

      <BoothFooter />
    </main>
  );
};

export default VerdictShare;
