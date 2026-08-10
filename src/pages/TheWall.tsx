import { useState, useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import ConfessionCard from "@/components/wall/ConfessionCard";
import type { ConfessionEntry } from "@/components/wall/ConfessionCard";

import { useWallSound } from "@/hooks/useWallSound";
import { useTimeAtmosphere } from "@/hooks/useTimeAtmosphere";
import { supabase } from "@/integrations/supabase/client";
import { venueDisplayName } from "@/lib/source";
import { logWallView, trackWallEngagement } from "@/lib/metrics";

// One component, two routes: /thewall (no param — behaviour unchanged) and
// /record/:venue (the same page filtered to one venue, a live URL you can send
// a venue owner). A wrapper page would fork ~270 lines of masthead/scanline/
// auto-scroll/pinned-bar that must stay identical forever; the param gate is
// the single point of divergence instead.
const TheWall = () => {
  const { venue: venueParam } = useParams<{ venue?: string }>();
  const venueSlug = (venueParam ?? "").trim().toLowerCase();
  const venueView = venueSlug !== "";
  // Display name from venues.json ONLY — the settled rule: the URL param is
  // untrusted and NEVER rendered; venues.json is the single source of truth
  // (same source the share card uses). Unknown slug → "" → redirect below.
  // (Console-added venues that aren't in venues.json therefore redirect too.)
  const venueTitle = venueView ? venueDisplayName("", venueSlug) : "";

  const [confessions, setConfessions] = useState<ConfessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confessionCount, setConfessionCount] = useState(0);
  // True only after a SUCCESSFUL fetch — the venue view's <3 redirect must fire
  // on real data, never on a failed query (a failure keeps the wall's existing
  // error handling: empty state, no redirect).
  const [loadedOk, setLoadedOk] = useState(false);

  // Feature 3: load only APPROVED confessions from Supabase.
  // RLS also enforces this server-side; the explicit filter keeps the query aligned.
  // Venue view adds .eq("source", slug) — anon CAN read source under the
  // "reads approved only" policy (row-level qual, no column mask; verified via
  // anon REST) — /thewall keeps the exact query it always had.
  useEffect(() => {
    const base = supabase
      .from("confessions")
      .select("subject_number, created_at, confession_text, verdict_text")
      .eq("status", "approved");
    (venueSlug ? base.eq("source", venueSlug) : base)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false);
          return;
        }
        const rows: ConfessionEntry[] = data.map((c) => {
          const createdAtMs = new Date(c.created_at).getTime();
          // Date-only fallback for the metadata line once relative time ages past
          // 7 days (the uppercase class in the card renders it as "30 JUL 2026").
          const timestamp = new Date(c.created_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          return {
            id: c.subject_number,
            confessorId: `#${c.subject_number}`,
            createdAtMs,
            timestamp,
            confession: c.confession_text,
            // Full verdict, shown plainly — same prominent treatment as Verdict /
            // VerdictShare (the old first-sentence + blurred-tail split is gone).
            verdict: c.verdict_text || "Verdict rendered.",
          };
        });
        setConfessions(rows);
        setConfessionCount(rows.length);
        setLoadedOk(true);
        setLoading(false);
      });
  }, [venueSlug]);

  const { soundEnabled, toggleSound } = useWallSound();
  const atmosphere = useTimeAtmosphere();

  // Wall analytics: one view per session + the 15s-visible engagement mark.
  // Both fire-and-forget after mount — never blocks or delays rendering.
  useEffect(() => {
    logWallView();
    return trackWallEngagement();
  }, []);


  // Very slow auto-scroll of the PAGE — the feed flows in the document scroller
  // (the feed div itself never overflows; the old el.scrollTop version was a no-op).
  // Pauses whenever the reader interacts (wheel / touch / pointer) and resumes 4s
  // after the last interaction, so a card being read never drifts away mid-sentence.
  useEffect(() => {
    const scroller = document.scrollingElement;
    if (!scroller) return;
    let pausedUntil = 0;
    const pause = () => {
      pausedUntil = Date.now() + 4000;
    };
    window.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("touchstart", pause, { passive: true });
    window.addEventListener("pointerdown", pause, { passive: true });
    // rAF + time delta (8px/s regardless of frame rate — interval timers throttle,
    // and scrollTop rounds sub-pixel writes away, so a fixed 0.4px-per-tick stalls).
    // Float accumulator with resync after every pause: we continue from wherever the
    // reader manually scrolled to instead of fighting them.
    const SPEED = 8; // px per second
    let pos: number | null = null;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (Date.now() < pausedUntil) {
        pos = null;
      } else {
        if (pos === null) pos = scroller.scrollTop;
        pos += SPEED * dt;
        scroller.scrollTop = pos;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", pause);
      window.removeEventListener("touchstart", pause);
      window.removeEventListener("pointerdown", pause);
    };
  }, []);


  // ── Venue-view fail states (the whole risk of a link you SEND someone) ──
  // Unknown slug → /thewall: never render a page titled with a raw slug.
  // Fewer than 3 approved → /thewall: a near-empty venue page reads as "nobody
  // used it" — worse than no venue page. THREE is the floor. Only fires on a
  // SUCCESSFUL load (loadedOk); a failed query keeps the wall's existing error
  // handling unchanged.
  if (venueView && !venueTitle) return <Navigate to="/thewall" replace />;
  if (venueView && loadedOk && confessionCount < 3) return <Navigate to="/thewall" replace />;

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden">
      {/* Ambient scan line */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          opacity: atmosphere.scanLineOpacity,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground) / 0.08) 2px, hsl(var(--foreground) / 0.08) 4px)",
          backgroundSize: "100% 4px",
        }}
      />
      {/* Moving scan line */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-10 h-[1px]"
        style={{
          opacity: atmosphere.movingScanOpacity,
          background: "hsl(var(--foreground))",
          animation: `scanline ${atmosphere.scanLineDuration} linear infinite`,
        }}
      />

      {/* Pinned header: title + Instagram follow. FIXED (not sticky): the
          outer wrapper's overflow-hidden breaks position:sticky, so this is pinned to the
          viewport and the feed below carries matching top padding. Stays on arrival and
          while the feed scrolls. */}
      {/* SOLID background — records showing through the /95 version read as a
          rendering bug, on every screen size. The feather below the lower edge
          makes content disappear cleanly as it scrolls under. */}
      <div className="fixed top-0 inset-x-0 z-20 bg-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-background to-transparent"
        />
        {/* Masthead: publisher above title — GUILTY (the wordmark, small and
            white, footer scale) publishes PUBLIC RECORD (the page). "PUBLIC
            RECORD" not "THE GUILTY": the old name collided with the wordmark
            above it (same word, two jobs), and no definite article — it's a
            designation, not a title, matching LOCATION WITHHELD / AS CHARGED.
            Spacing: mark + title grouped tight, then the space OPENS below the
            title so the masthead reads as one block over the feed. Title
            outranks the verdicts below it — on a page of verdicts the masthead
            must be the biggest type. Both bars are pinned, so every px here is
            feed space. Content capped to the SAME 680px frame as the records
            column — one axis. */}
        <div className="mx-auto max-w-[680px] pt-6 pb-6 md:pt-8 md:pb-7 px-6 text-center">
          {/* NO GUILTY wordmark above the title — removed DELIBERATELY, and it
              was the last visible one in the app: the Booth may not remain a
              GUILTY property, and the share card carries the branding where it
              travels. Not replaced with the Booth mark either — the masthead
              is already the page's identity. */}
          {/* Venue view: the venue's display name replaces PUBLIC RECORD, on a
              SIZE STEP by name length (never two lines — a wrapped title grows
              the fixed masthead and breaks the feed-padding clearance).
              ≤14 chars rides at PUBLIC RECORD's own size; longer names step
              down so the longest real names still fit 375px on one line. */}
          <h1
            className={
              "font-control font-bold text-foreground tracking-wide " +
              (!venueView || venueTitle.length <= 14
                ? "text-4xl md:text-5xl"
                : venueTitle.length <= 20
                  ? "text-3xl md:text-4xl"
                  : venueTitle.length <= 26
                    ? "text-2xl md:text-3xl"
                    : "text-xl md:text-2xl") +
              (venueView ? " uppercase" : "")
            }
          >
            {venueView ? venueTitle : "PUBLIC RECORD"}
            {/* The pulsing dot — all that survives of the LIVE CONFESSIONS line
                (the words described what's visible three lines down; the dot is
                the signal that it's happening NOW). Status indicator, not type,
                so it sits inside the title line. Populated view ONLY — a
                manually-gated wall has no real-time status on empty. */}
            {confessions.length > 0 && (
              /* -top-1: align-middle seats the 9px dot on the x-height midline,
                 3.7px below the CAPS' optical centre (caps-only title) — the 4px
                 raise centres it on the measured cap centre. */
              <span className="record-pulse-dot relative -top-1 ml-3 inline-block w-[9px] h-[9px] rounded-full bg-ritual align-middle" />
            )}
          </h1>

          {/* Venue view only: the count + the way back to the full record.
              Rendered post-load only (the <3 redirect guarantees the count
              shown is ≥3 — never a flash of "0 ON RECORD"). */}
          {venueView && !loading && (
            <p className="mt-2 font-mono-light text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {confessionCount} on record ·{" "}
              <Link to="/thewall" className="transition-colors hover:text-foreground">
                Public record →
              </Link>
            </p>
          )}

          <div className="mt-2 flex justify-center">
            <a
              href="https://instagram.com/theboothrecord"
              target="_blank"
              rel="noopener"
              className="text-[10px] font-mono-light tracking-wide text-muted-foreground hover:text-foreground transition-opacity"
            >
              @theboothrecord
            </a>
          </div>
        </div>
      </div>

      {/* Confession feed. Top padding clears the FIXED masthead (≈111px mobile
          now the wordmark is gone, taller at md where its paddings/type grow;
          the venue view's ON RECORD line adds ~20px, so it gets one step
          more); bottom padding clears the single-row pinned bar (≈107px) so
          the last confession isn't hidden underneath.
          680px cap: verdicts ran ~100 chars at 720; comfortable measure is 45–75.
          Below 680px viewport the cap is inert — mobile is unchanged. */}
      <div
        className={
          "max-w-[680px] mx-auto px-6 pb-[132px] " +
          (venueView ? "pt-40 md:pt-48" : "pt-32 md:pt-40")
        }
      >
        {loading ? (
          <div className="text-center py-20">
            <span className="text-muted-foreground/80 text-[10px] tracking-[0.4em] uppercase font-mono-light animate-pulse">
              LOADING CONFESSIONS...
            </span>
          </div>
        ) : confessions.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-muted-foreground/80 text-[10px] tracking-[0.4em] uppercase font-mono-light">
              NO CONFESSIONS YET
            </span>
          </div>
        ) : (
          confessions.map((entry, i) => (
            // No separators, no dividers — whitespace alone divides the records
            // (the hairline rule means "record ends, actions begin" elsewhere in
            // the app and must not become a list separator here): 6px inside a
            // pair, 14px to the filing stamp, 52px between records.
            <div key={entry.id} className="mb-[52px]">
              <ConfessionCard
                entry={entry}
                index={i}
                total={confessions.length}
                isNew={!!entry.insertedAt}
              />
            </div>
          ))
        )}
      </div>

      {/* Pinned CTA. Fixed to the screen, not the page — always visible while scrolling,
          never covers a confession, never demands dismissal. Replaces both the timed modal
          and the dim end-of-scroll link. Booth palette, not a browser dialog.
          /thewall: no ?source= needed — captureSourceFromUrl() falls back to
          sessionStorage on a param-less URL, so the venue still carries through.
          Venue view: ?source={slug} explicitly, so a confession made from the
          venue's page attributes to that venue (same param shape as QR scans
          and VerdictShare's CTA; Confess captures it before its consent
          redirect, so the attribution survives a bounce through the gate). */}
      {/* Solid bar + a gradient feather above it: records fade out into background
          rather than colliding with the button's edge. Content shares the records
          column's 680px frame — one axis. */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/30 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Tight fade — 16px: content stays legible until it is close to the
            button; the feather only kills the hard collision at the bar's edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-background to-transparent"
        />
        <div className="mx-auto max-w-[680px] px-6 py-3">
          {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
              hairline (muted-foreground/40, the divider's own rule),
              transparent (the glow is the only colour in the box), no caption —
              YOUR TURN says what it does. The box sits over the bar's SOLID
              background (not the scrolling records — they fade at the feather and
              pass beneath the bar), so nothing shows through the frame. */}
          <Link
            to={venueView ? `/confess?source=${encodeURIComponent(venueSlug)}` : "/confess"}
            className="btn-booth block whitespace-nowrap border border-muted-foreground/40 bg-transparent text-center text-sm hover:bg-transparent"
          >
            <span className="enter-glow-text text-[hsl(var(--ritual-green))]">YOUR TURN →</span>
          </Link>
        </div>
      </div>

      <BoothFooter />

      <style>{`
        @keyframes scanline {
          0% { top: 0; }
          100% { top: 100vh; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default TheWall;
