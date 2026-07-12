import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";
import { captureSourceFromUrl } from "@/lib/source";
import { logScan } from "@/lib/metrics";

const Index = () => {
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
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

  const fullText1 = "Once you begin, you can't take it back.";
  const fullText2 = "That's the point.";

  // (Venue ?source= capture now happens globally in App.tsx on every load.)

  // Count this arrival at the gate — once per session, fire-and-forget (see logScan). The
  // source was already captured on load; read it back (returns 'direct' fallback via
  // logScan when absent). Never blocks entry.
  useEffect(() => {
    logScan(captureSourceFromUrl());
  }, []);

  useEffect(() => {
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
  }, []);

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
    if (!consent) return; // consent gate — ENTER blocked until ticked
    // Record consent for the session so /confess (including QR deep-links) can require
    // it. Session-scoped: a fresh scan (new session) re-gates; repeats within the
    // session ("go deeper") do not.
    sessionStorage.setItem("consent", "1");
    navigate("/confidentiality");
  };

  return (
    <div className="screen-container animate-fade-in">
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
      
      <div className="fixed bottom-24 left-0 right-0 flex flex-col items-center gap-4 px-6">
        <div className="flex items-start gap-3 max-w-xs">
          <input
            type="checkbox"
            id="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            autoComplete="off"
            className="mt-[2px] h-4 w-4 shrink-0 accent-[hsl(var(--ritual-green))] cursor-pointer"
          />
          <label
            htmlFor="consent"
            className="text-muted-foreground text-[11px] leading-snug font-mono-light cursor-pointer select-none"
          >
            I'm 18+ and I understand my confession may be published anonymously. I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Privacy
            </a>
            .
          </label>
        </div>
        <button
          onClick={handleEnter}
          disabled={!consent}
          className="btn-booth disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ENTER
        </button>
      </div>

      <BoothFooter />
    </div>
  );
};

export default Index;
