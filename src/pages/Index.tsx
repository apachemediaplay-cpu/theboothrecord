import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useState, useEffect, useRef } from "react";
import BoothHeader from "@/components/BoothHeader";
import LegalLinks from "@/components/LegalLinks";
import { captureSourceFromUrl } from "@/lib/source";
import { logScan } from "@/lib/metrics";

const Index = () => {
  const navigate = useNavigate();
  // Hold the screen awake on this flow screen (released on unmount / absent
  // API / refusal are all silent) — see useWakeLock.
  useWakeLock();
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [showCursor1, setShowCursor1] = useState(true);
  const [showCursor2, setShowCursor2] = useState(false);
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchOffset2, setGlitchOffset2] = useState(0);
  const [glitchTop, setGlitchTop] = useState(30);
  const [glitchTop2, setGlitchTop2] = useState(60);
  const glitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Merged gate + threshold copy (the /confidentiality screen is gone — one
  // screen does the job once). Same typing speeds and glitch as always.
  const fullText1 = "Confessions. Anonymous. Unfiltered. Judged.";
  const fullText2 = "One verdict. No appeal.";

  // ── Opening sequence: mark (hold 2200ms — one full breath of the dot's 2.2s
  // pulse) → fading (500ms out) → gate at 2700ms, when the content fades in and
  // the typing starts. prefers-reduced-motion starts directly at 'gate' (no
  // mark, no pulse, straight to typing).
  const [phase, setPhase] = useState<"mark" | "fading" | "gate">(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "gate"
      : "mark",
  );

  useEffect(() => {
    if (phase === "gate") return; // reduced-motion start — nothing to sequence
    const fadeT = window.setTimeout(
      () => setPhase((p) => (p === "mark" ? "fading" : p)),
      2200,
    );
    const gateT = window.setTimeout(() => setPhase("gate"), 2700);
    // Any tap or key during the hold skips straight to the gate. The late-firing
    // timers are harmless after a skip: fadeT only downgrades from 'mark', and
    // gateT re-sets 'gate' which React ignores.
    const skip = () => setPhase("gate");
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(gateT);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
    // Mount-once in practice: phase only moves forward, and the guard exits for
    // every phase but the initial 'mark'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Venue ?source= capture now happens globally in App.tsx on every load.)

  // Count this arrival at the gate — once per session, fire-and-forget (see logScan). The
  // source was already captured on load; read it back (returns 'direct' fallback via
  // logScan when absent). Never blocks entry.
  useEffect(() => {
    logScan(captureSourceFromUrl());
  }, []);

  useEffect(() => {
    // The typing waits for the opening sequence — it starts the moment the gate
    // content fades in, and runs exactly as it always has from there.
    if (phase !== "gate") return;
    let index = 0;
    const typeText1 = setInterval(() => {
      if (index < fullText1.length) {
        setText1(fullText1.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeText1);
        setShowCursor1(false);
        setShowCursor2(true);
        
        // Start typing second text after a brief pause
        setTimeout(() => {
          let index2 = 0;
          const typeText2 = setInterval(() => {
            if (index2 < fullText2.length) {
              setText2(fullText2.slice(0, index2 + 1));
              index2++;
            } else {
              clearInterval(typeText2);
              setShowCursor2(false);
              
              // Trigger one final glitch near transition
              setTimeout(() => {
                triggerGlitch();
              }, 1200);
              
              // Auto-navigate after 2 seconds
              // setTimeout(() => {
              //   navigate("/confidentiality");
              // }, 2000);
            }
          }, 60);
        }, 400);
      }
    }, 50);

    return () => clearInterval(typeText1);
  }, [phase]);

  const triggerGlitch = () => {
    // First slice - more aggressive offset
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8); // 6-14px
    const top = 15 + Math.random() * 20; // 15-35% from top
    
    // Second slice - opposite direction
    const offset2 = -offset * (0.5 + Math.random() * 0.5); // Counter-direction
    const top2 = 55 + Math.random() * 25; // 55-80% from top
    
    setGlitchOffset(offset);
    setGlitchTop(top);
    setGlitchOffset2(offset2);
    setGlitchTop2(top2);
    setIsGlitching(true);
    
    const duration = 100 + Math.random() * 80; // 100-180ms
    setTimeout(() => {
      setIsGlitching(false);
    }, duration);
  };

  // Random glitch interval (3-8 seconds)
  useEffect(() => {
    if (text2.length === fullText2.length) {
      const scheduleGlitch = () => {
        const delay = 2000 + Math.random() * 3000; // 2-5 seconds (more frequent)
        glitchIntervalRef.current = setTimeout(() => {
          triggerGlitch();
          scheduleGlitch();
        }, delay);
      };
      scheduleGlitch();
    }
    
    return () => {
      if (glitchIntervalRef.current) {
        clearTimeout(glitchIntervalRef.current);
      }
    };
  }, [text2]);

  const handleEnter = () => {
    // Consent IS the tap — the legal line above BEGIN states it, no checkbox.
    // Session-scoped, exactly as before: a fresh scan (new session) re-gates;
    // repeats within the session ("go deeper") do not. Straight to /confess —
    // the threshold screen this used to route through is merged into this one.
    sessionStorage.setItem("consent", "1");
    navigate("/confess");
  };

  return (
    <div className="screen-container animate-fade-in">
      {/* Opening mark — centred on the gate background, holds 2200ms, fades out
          over 500ms. The dot is a SPAN (not in the SVG) so its glow can use
          box-shadow, centred at 50% / 67.08% of the mark box — the same geometry
          as the share-page mark's circle (cy 161 of 240). Pulse takes
          .listen-glow-dot's shape (scale 1→1.15, alphas .90/.55/.30 → 1/.88/.60,
          ease-in-out; blur radii scale with the dot) but on a 2.2s cycle, NOT
          the listening line's 2.8s — DELIBERATE: the hold and the breath must be
          the same length, and the two screens are never seen together. */}
      {phase !== "gate" && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${
            phase === "fading" ? "opacity-0" : "opacity-100"
          }`}
        >
          <style>{`
            .gate-mark { width: 176px; height: 176px; }
            .gate-mark-dot {
              width: 27px;
              height: 27px;
              background: hsl(var(--ritual-green));
              animation: gateDotPulseM 2.2s ease-in-out infinite;
            }
            @keyframes gateDotPulseM {
              0%, 100% {
                transform: scale(1);
                box-shadow:
                  0 0 12px hsl(var(--ritual-green) / 0.90),
                  0 0 28px hsl(var(--ritual-green) / 0.55),
                  0 0 60px hsl(var(--ritual-green) / 0.30);
              }
              50% {
                transform: scale(1.15);
                box-shadow:
                  0 0 19px hsl(var(--ritual-green) / 1),
                  0 0 56px hsl(var(--ritual-green) / 0.88),
                  0 0 128px hsl(var(--ritual-green) / 0.60);
              }
            }
            @media (min-width: 768px) {
              .gate-mark { width: 288px; height: 288px; }
              .gate-mark-dot {
                width: 44px;
                height: 44px;
                animation-name: gateDotPulseD;
              }
            }
            @keyframes gateDotPulseD {
              0%, 100% {
                transform: scale(1);
                box-shadow:
                  0 0 19px hsl(var(--ritual-green) / 0.90),
                  0 0 46px hsl(var(--ritual-green) / 0.55),
                  0 0 98px hsl(var(--ritual-green) / 0.30);
              }
              50% {
                transform: scale(1.15);
                box-shadow:
                  0 0 31px hsl(var(--ritual-green) / 1),
                  0 0 91px hsl(var(--ritual-green) / 0.88),
                  0 0 209px hsl(var(--ritual-green) / 0.60);
              }
            }
            .gate-wordmark {
              margin-top: 40px;
              font-size: 24px;
              letter-spacing: 0.20em;
              /* letter-spacing adds a trailing space after the last glyph, which
                 inflates the CSS box and drags the flex centring ~2px left of the
                 visible glyphs. Cancel exactly one letter-space so the box matches
                 the glyph extent and the lockup centres optically. */
              margin-right: -0.20em;
            }
            @media (min-width: 768px) {
              .gate-wordmark {
                margin-top: 66px;
                font-size: 39px;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .gate-mark-dot { animation: none; }
            }
          `}</style>
          {/* Mark + wordmark are ONE lockup: the flex column centres the combined
              block, so the mark sits slightly higher than it would alone — the
              wordmark's weight is accounted for in the centring. */}
          <div className="flex flex-col items-center">
            <div className="gate-mark relative">
              <svg viewBox="0 0 240 240" className="h-full w-full">
                <path
                  d="M58.5 210 L58.5 109 A61.5 61.5 0 0 1 181.5 109 L181.5 210"
                  fill="none"
                  stroke="hsl(var(--ritual-green))"
                  strokeWidth="31"
                />
                <rect x="32" y="210" width="175" height="18" fill="hsl(var(--ritual-green))" />
              </svg>
              {/* Outer span carries the centring translate; inner span carries the
                  pulse — the animation's scale() must not fight the positioning. */}
              <span
                className="absolute"
                style={{ left: "50%", top: "67.08%", transform: "translate(-50%, -50%)" }}
              >
                <span className="gate-mark-dot block rounded-full" />
              </span>
            </div>
            <p className="gate-wordmark font-control font-bold uppercase text-foreground">
              THE BOOTH
            </p>
          </div>
        </div>
      )}

      {/* flex-1 flex-col so the hero's flex-1 centring works exactly as it did
          when these were direct children of screen-container. */}
      <div
        className={`flex-1 flex flex-col transition-opacity duration-500 ${
          phase === "gate" ? "opacity-100" : "opacity-0"
        }`}
      >
      <BoothHeader />

      <div className="flex-1 flex flex-col justify-center">
        <h1 className="font-control text-3xl md:text-6xl font-bold leading-tight text-foreground mb-8">
          {text1}
          {showCursor1 && <span className="animate-pulse">|</span>}
        </h1>

        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem] relative">
          <span className="relative inline-block">
            {text2}
            {showCursor2 && <span className="animate-pulse">|</span>}
            {/* Glitch slice overlays */}
            {isGlitching && text2 && (
              <>
                {/* First slice */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset}px)`,
                    clipPath: `inset(${glitchTop}% 0 ${100 - glitchTop - 20}% 0)`,
                    textShadow: '2px 0 #ff0000, -2px 0 #00ffff',
                  }}
                >
                  {text2}
                </span>
                {/* Second slice */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset2}px)`,
                    clipPath: `inset(${glitchTop2}% 0 ${100 - glitchTop2 - 15}% 0)`,
                    textShadow: '-2px 0 #ff0000, 2px 0 #00ffff',
                  }}
                >
                  {text2}
                </span>
              </>
            )}
          </span>
        </p>
      </div>
      
      {/* max-w-md mx-auto: the FIXED block escapes screen-container's column
          (fixed spans the viewport), so it re-applies the same cap the headline
          above already sits in — one column, button and text aligned. Same
          value as every action screen (screen-container); the wall's 680px is
          the reading feed's, not an action column. */}
      <div className="fixed bottom-24 left-0 right-0 mx-auto max-w-md flex flex-col items-center gap-4 px-6">
        {/* Always enabled — the tap IS the consent (see the legal line below). */}
        {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
            hairline (muted-foreground/40, the divider's own rule), transparent.
            The label stays WHITE — BEGIN does not go green; begin-glow-text is
            the green glows' exact curve in white, which reads softer, and that
            quieter read is the point: the machine isn't listening yet. */}
        <button
          onClick={handleEnter}
          className="btn-booth border border-muted-foreground/40 bg-transparent hover:bg-transparent"
        >
          <span className="begin-glow-text">BEGIN</span>
        </button>
        {/* PASS IT ROUND — the group format's entry. Quiet mono link below
            BEGIN (SEE THE RECORD's register, underlined for affordance next to
            legal text). Deliberately does NOT set consent — BEGIN's line
            covers one person; the round's own screen takes consent for the
            table via its number tap. */}
        <button
          onClick={() => navigate("/round")}
          className="text-[13px] font-mono-light tracking-wide text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          PASS IT ROUND
        </button>
        <p className="max-w-xs text-center text-[9.5px] leading-snug font-mono-light text-muted-foreground/70">
          I agree, by tapping BEGIN, that I'm 18+ and my confession may be published
          anonymously. <LegalLinks />.
        </p>
      </div>

      </div>
    </div>
  );
};

export default Index;
