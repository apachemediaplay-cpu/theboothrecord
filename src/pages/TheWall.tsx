import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Instagram } from "lucide-react";
import BoothFooter from "@/components/BoothFooter";
import ConfessionCard from "@/components/wall/ConfessionCard";
import type { ConfessionEntry } from "@/components/wall/ConfessionCard";

import { useWallSound } from "@/hooks/useWallSound";
import { useTimeAtmosphere } from "@/hooks/useTimeAtmosphere";
import { supabase } from "@/integrations/supabase/client";
import { logWallView, trackWallEngagement } from "@/lib/metrics";

const TheWall = () => {
  const [confessions, setConfessions] = useState<ConfessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confessionCount, setConfessionCount] = useState(0);

  // Feature 3: load only APPROVED confessions from Supabase.
  // RLS also enforces this server-side; the explicit filter keeps the query aligned.
  useEffect(() => {
    supabase
      .from("confessions")
      .select("subject_number, created_at, confession_text, verdict_text")
      .eq("status", "approved")
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
        setLoading(false);
      });
  }, []);

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

      {/* Pinned header: title + live status + Instagram follow. FIXED (not sticky): the
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
        {/* Masthead: three centred rows in descending size, tight — one block, not
            three elements. Both bars are pinned, so every px here is feed space.
            Content capped to the SAME 680px frame as the records column — one axis. */}
        <div className="mx-auto max-w-[680px] pt-6 pb-3 md:pt-8 md:pb-4 px-6 text-center">
          <h1 className="font-control text-2xl md:text-3xl font-bold text-foreground tracking-wide">
            THE GUILTY
          </h1>

          {/* Live indicator — populated view ONLY. A manually-gated wall has no
              real-time status, so this is suppressed on the empty state (it would
              misrepresent it). Words share the dot's ritual green — one indicator. */}
          {confessions.length > 0 && (
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="text-ritual/80 text-[9px] tracking-[0.5em] uppercase font-mono-light">
                LIVE CONFESSIONS
              </span>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-ritual/80"
                style={{ animation: `livePulse ${atmosphere.pulseDuration} ease-in-out infinite` }}
              />
            </div>
          )}

          <div className="mt-1.5 flex justify-center">
            <a
              href="https://instagram.com/houseofguilty"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[10px] font-mono-light tracking-wide text-muted-foreground hover:text-foreground transition-opacity"
            >
              <Instagram size={12} strokeWidth={1.75} aria-hidden="true" />
              @houseofguilty
            </a>
          </div>
        </div>
      </div>

      {/* Confession feed. Top padding clears the FIXED masthead (≈107px mobile, taller
          at md where its paddings/type grow); bottom padding clears the single-row
          pinned bar (≈107px) so the last confession isn't hidden underneath.
          680px cap: verdicts ran ~100 chars at 720; comfortable measure is 45–75.
          Below 680px viewport the cap is inert — mobile is unchanged. */}
      <div className="max-w-[680px] mx-auto px-6 pt-32 md:pt-36 pb-[132px]">
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
          No ?source= needed: captureSourceFromUrl() falls back to sessionStorage on a
          param-less URL, so the venue still carries through to the confession. */}
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
          {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 2px border at
              40% in the same colour, no background fill, no caption — YOUR TURN
              says what it does. The transparent box sits over the bar's SOLID
              background (not the scrolling records — they fade at the feather and
              pass beneath the bar), so nothing shows through the frame. */}
          <Link
            to="/confess"
            className="btn-booth block whitespace-nowrap border-2 border-[hsl(var(--ritual-green)/0.4)] bg-transparent text-center text-sm hover:bg-transparent"
          >
            <span className="enter-glow-text text-[hsl(var(--ritual-green))]">YOUR TURN →</span>
          </Link>
        </div>
      </div>

      <BoothFooter />

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 0.3; box-shadow: 0 0 3px hsl(var(--ritual-green) / 0.2); }
          50% { opacity: 1; box-shadow: 0 0 8px hsl(var(--ritual-green) / 0.5); }
        }
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
