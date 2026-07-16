import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Instagram } from "lucide-react";
import BoothFooter from "@/components/BoothFooter";
import ConfessionCard from "@/components/wall/ConfessionCard";
import type { ConfessionEntry } from "@/components/wall/ConfessionCard";

import { useWallSound } from "@/hooks/useWallSound";
import { useTimeAtmosphere } from "@/hooks/useTimeAtmosphere";
import { supabase } from "@/integrations/supabase/client";

const TheWall = () => {
  const feedRef = useRef<HTMLDivElement>(null);
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
          const timestamp = new Date(c.created_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          // Extract first sentence as visible verdict, rest as hidden
          const sentences = (c.verdict_text || "").split(/(?<=\.)\s+/);
          const verdict = sentences[0] || "Verdict rendered.";
          const verdictHidden = sentences.slice(1).join(" ") || "";

          return {
            id: c.subject_number,
            confessorId: `#${c.subject_number}`,
            timestamp,
            confession: c.confession_text,
            verdict,
            verdictHidden,
          };
        });
        setConfessions(rows);
        setConfessionCount(rows.length);
        setLoading(false);
      });
  }, []);

  const { soundEnabled, toggleSound } = useWallSound();
  const atmosphere = useTimeAtmosphere();


  // Very slow auto-scroll
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const interval = setInterval(() => {
      el.scrollTop += 0.4;
    }, 50);
    return () => clearInterval(interval);
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
      <div className="fixed top-0 inset-x-0 z-20 bg-background/95 backdrop-blur-sm">
        {/* Header */}
        <div className="pt-16 pb-4 md:pt-20 md:pb-6 text-center px-6">
          <h1 className="font-control text-2xl md:text-3xl font-bold text-foreground tracking-wide mb-2">
            THE GUILTY
          </h1>
        </div>

        {/* Live indicator — populated view ONLY. A manually-gated wall has no real-time
            status, so this is suppressed on the empty state (it would misrepresent it). */}
        {confessions.length > 0 && (
          <div className="flex items-center justify-center gap-2 pb-6 md:pb-8">
            <span className="text-muted-foreground/80 text-[9px] tracking-[0.5em] uppercase font-mono-light">
              LIVE CONFESSIONS
            </span>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-ritual/80"
              style={{ animation: `livePulse ${atmosphere.pulseDuration} ease-in-out infinite` }}
            />
          </div>
        )}

        {/* Instagram follow. Placed here, NOT in the pinned bar: the bar has one job
            (return them to /confess) and a second link would dilute it. This catches the
            confessors who chose NOT to share — the Verdict screen's follow link is gated
            behind hasShared, so that group is otherwise never asked. */}
        <div className="flex justify-center pb-6 md:pb-8">
          <a
            href="https://instagram.com/houseofguilty"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm font-mono-light tracking-wide text-[#FF4800] hover:opacity-80 transition-opacity"
          >
            <Instagram size={15} strokeWidth={1.75} aria-hidden="true" />
            @houseofguilty
          </a>
        </div>
      </div>

      {/* Confession feed. Top padding clears the FIXED header (≈202px mobile, taller at md
          where its paddings/type grow) so the first confession isn't hidden underneath. */}
      <div ref={feedRef} className="max-w-[720px] mx-auto px-6 pt-52 md:pt-64 pb-40">
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
            <div key={entry.id}>
              <ConfessionCard
                entry={entry}
                index={i}
                total={confessions.length}
                isNew={!!entry.insertedAt}
              />
              {i < confessions.length - 1 && (
                <div className="border-t border-border/15 my-7 md:my-8" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Pinned CTA. Fixed to the screen, not the page — always visible while scrolling,
          never covers a confession, never demands dismissal. Replaces both the timed modal
          and the dim end-of-scroll link. Booth palette, not a browser dialog.
          No ?source= needed: captureSourceFromUrl() falls back to sessionStorage on a
          param-less URL, so the venue still carries through to the confession. */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/30 bg-background/95 backdrop-blur-sm">
        <div className="px-6 py-3">
          {/* YOUR TURN. stays the small green lead-in; ENTER THE BOOTH promoted from muted
              text to the btn-booth primary (bordered, prominent) so it reads as THE action.
              Bar position/z/border/blur unchanged — only the button's visual weight. */}
          <p className="text-ritual/70 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-2 text-center">
            YOUR TURN.
          </p>
          <Link to="/confess" className="btn-booth block text-center">
            ENTER THE BOOTH →
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
