import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";
import ConfessionCard from "@/components/wall/ConfessionCard";
import type { ConfessionEntry } from "@/components/wall/ConfessionCard";
import { SYSTEM_MESSAGES, EXTRA_CONFESSIONS, BASE_CONFESSIONS } from "@/components/wall/confessionData";
import { useWallSound } from "@/hooks/useWallSound";
import { useTimeAtmosphere } from "@/hooks/useTimeAtmosphere";

const TheWall = () => {
  const feedRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [confessions, setConfessions] = useState<ConfessionEntry[]>(
    BASE_CONFESSIONS.map((c) => ({ ...c }))
  );
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemMessageVisible, setSystemMessageVisible] = useState(false);
  const [showGhost, setShowGhost] = useState(false);
  const [confessionCount, setConfessionCount] = useState(1842);
  const [showBoothPrompt, setShowBoothPrompt] = useState(false);
  const [boothPromptVisible, setBoothPromptVisible] = useState(false);
  const [boothDismissed, setBoothDismissed] = useState(false);
  const nextIdRef = useRef(100);
  const nextConfessorRef = useRef(1850);
  const extraIndexRef = useRef(0);
  const archiveIdRef = useRef(1795);

  const { soundEnabled, toggleSound, playTone } = useWallSound();
  const atmosphere = useTimeAtmosphere();

  // Flash system message
  const flashSystemMessage = useCallback(() => {
    const msg = SYSTEM_MESSAGES[Math.floor(Math.random() * SYSTEM_MESSAGES.length)];
    setSystemMessage(msg);
    setSystemMessageVisible(true);
    setTimeout(() => setSystemMessageVisible(false), 1200);
    setTimeout(() => setSystemMessage(null), 1800);
  }, []);

  // Insert a new confession with ghost effect
  const insertConfession = useCallback(() => {
    // Phase 1: Show ghost
    setShowGhost(true);

    // Phase 2: After 3s, hide ghost, flash message, insert
    setTimeout(() => {
      setShowGhost(false);
      flashSystemMessage();
      playTone();

      setTimeout(() => {
        const extra = EXTRA_CONFESSIONS[extraIndexRef.current % EXTRA_CONFESSIONS.length];
        extraIndexRef.current++;
        const newId = nextIdRef.current++;
        const confessorNum = nextConfessorRef.current++;

        const newEntry: ConfessionEntry = {
          ...extra,
          id: newId,
          confessorId: `#${confessorNum}`,
          timestamp: new Date().toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          insertedAt: Date.now(),
        };

        setConfessions((prev) => [newEntry, ...prev]);
        setConfessionCount((c) => c + 1);
      }, 400);
    }, 3000);
  }, [flashSystemMessage, playTone]);

  // Random insertion every 25-55s
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 25000 + Math.random() * 30000;
      return setTimeout(() => {
        insertConfession();
        timerRef = scheduleNext();
      }, delay);
    };
    let timerRef = scheduleNext();
    return () => clearTimeout(timerRef);
  }, [insertConfession]);

  // Very slow auto-scroll
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const interval = setInterval(() => {
      el.scrollTop += 0.4;
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Show booth prompt after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!boothDismissed) {
        setShowBoothPrompt(true);
        setTimeout(() => setBoothPromptVisible(true), 50);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [boothDismissed]);

  // Infinite scroll — append older confessions when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setConfessions((prev) => {
            if (prev.length >= 50) return prev;
            const batch: ConfessionEntry[] = [];
            for (let i = 0; i < 5; i++) {
              const extra = EXTRA_CONFESSIONS[(extraIndexRef.current + i) % EXTRA_CONFESSIONS.length];
              const archiveId = archiveIdRef.current--;
              batch.push({
                ...extra,
                id: nextIdRef.current++,
                confessorId: `#${archiveId}`,
                timestamp: `${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")} Feb 2026 — ${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")} ${Math.random() > 0.5 ? "AM" : "PM"}`,
              });
            }
            extraIndexRef.current += 5;
            return [...prev, ...batch];
          });
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden">
      <BoothHeader />

      {/* Sound toggle */}
      <button
        onClick={toggleSound}
        className="fixed top-5 right-5 z-20 flex items-center gap-2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors duration-300"
      >
        <span className="text-[9px] tracking-[0.3em] uppercase font-mono-light">
          SOUND
        </span>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
            soundEnabled ? "bg-ritual" : "bg-muted-foreground/30"
          }`}
        />
      </button>

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

      {/* Header */}
      <div className="pt-16 pb-4 md:pt-20 md:pb-6 text-center px-6">
        <h1 className="font-control text-2xl md:text-3xl font-bold text-foreground tracking-wide mb-2">
          THE WALL
        </h1>
        <p className="text-muted-foreground/40 text-[10px] md:text-xs font-mono-light tracking-[0.2em] leading-relaxed">
          Some truths don't disappear.
          <br />
          They just get recorded.
        </p>
      </div>

      {/* Confession counter */}
      <div className="text-center pb-3">
        <span className="text-muted-foreground/25 text-[10px] tracking-[0.4em] uppercase font-mono-light">
          {confessionCount.toLocaleString()} CONFESSIONS RECORDED
        </span>
      </div>

      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2 pb-6 md:pb-8">
        <span className="text-muted-foreground/30 text-[9px] tracking-[0.5em] uppercase font-mono-light">
          LIVE CONFESSIONS
        </span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-ritual/80"
          style={{ animation: `livePulse ${atmosphere.pulseDuration} ease-in-out infinite` }}
        />
      </div>

      {/* System message flash */}
      <div className="h-5 flex items-center justify-center mb-2">
        {systemMessage && (
          <span
            className={`text-ritual/70 text-[9px] tracking-[0.4em] uppercase font-mono-light transition-all duration-500 ${
              systemMessageVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
            }`}
          >
            {systemMessage}
          </span>
        )}
      </div>

      {/* Typing ghost */}
      <div className="h-6 flex items-center justify-center mb-2">
        <span
          className={`text-ritual/50 text-[10px] tracking-[0.3em] font-mono-light transition-all duration-700 ${
            showGhost ? "opacity-100" : "opacity-0"
          }`}
        >
          someone is confessing
          <span className="inline-block w-[1px] h-3 bg-ritual/60 ml-1 align-middle" style={{ animation: "blink 1s step-end infinite" }} />
        </span>
      </div>

      {/* Confession feed */}
      <div ref={feedRef} className="max-w-[720px] mx-auto px-6 pb-16">
        {confessions.map((entry, i) => (
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
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {/* Submit your own CTA */}
        <div className="py-16 text-center">
          <Link
            to="/confess"
            className="group inline-block"
          >
            <p className="text-muted-foreground/25 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-2 group-hover:text-muted-foreground/50 transition-colors duration-500">
              YOUR TURN.
            </p>
            <p className="text-muted-foreground/35 text-[11px] tracking-[0.3em] uppercase font-mono-light group-hover:text-ritual/60 transition-colors duration-500">
              ENTER THE BOOTH →
            </p>
          </Link>
        </div>
      </div>

      {/* Booth prompt popup with overlay */}
      {showBoothPrompt && !boothDismissed && (
        <>
          <div
            className={`fixed inset-0 z-30 bg-background/60 transition-opacity duration-700 ${
              boothPromptVisible ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => {
              setBoothPromptVisible(false);
              setTimeout(() => {
                setShowBoothPrompt(false);
                setBoothDismissed(true);
              }, 500);
            }}
          />
          <div
            className={`fixed inset-0 z-40 flex items-center justify-center p-4 transition-all duration-700 ${
              boothPromptVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className={`relative border border-foreground/20 bg-primary px-8 py-6 sm:px-12 sm:py-8 text-center shadow-[0_0_40px_rgba(255,255,255,0.1)] w-full max-w-[320px] sm:max-w-[360px] transition-transform duration-700 ${
              boothPromptVisible ? "scale-100" : "scale-95"
            }`}>
              <button
                onClick={() => {
                  setBoothPromptVisible(false);
                  setTimeout(() => {
                    setShowBoothPrompt(false);
                    setBoothDismissed(true);
                  }, 500);
                }}
                className="absolute top-3 right-4 text-primary-foreground/40 hover:text-primary-foreground/70 text-[10px] font-mono-light transition-colors"
              >
                ✕
              </button>
              <Link to="/confess" className="group inline-block">
                <p className="text-primary-foreground/60 text-[10px] tracking-[0.5em] uppercase font-mono-light mb-3 group-hover:text-primary-foreground/80 transition-colors duration-500">
                  YOUR TURN.
                </p>
                <p className="text-primary-foreground/80 text-[12px] tracking-[0.3em] uppercase font-mono-light group-hover:text-primary-foreground transition-colors duration-500">
                  ENTER THE BOOTH →
                </p>
              </Link>
            </div>
          </div>
        </>
      )}

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
