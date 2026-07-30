import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import BoothFooter from "@/components/BoothFooter";

const Confidentiality = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchOffset2, setGlitchOffset2] = useState(0);
  const [glitchTop, setGlitchTop] = useState(30);
  const [glitchTop2, setGlitchTop2] = useState(60);
  const glitchIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fullText = 'One verdict. No appeal.';

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

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setShowCursor(false);

        // Trigger one final glitch near transition
        setTimeout(() => {
          triggerGlitch();
        }, 1200);

        // Auto-navigate after 2 seconds
        // setTimeout(() => {
        //   navigate("/confess");
        // }, 3500);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, []);

  // Random glitch interval (same cadence as the gate's "That's the point.")
  useEffect(() => {
    if (typedText.length === fullText.length) {
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
  }, [typedText]);

  const handleProceed = () => {
    navigate("/confess");
  };

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center">
        <h1 className="font-control text-3xl md:text-6xl font-bold leading-tight text-foreground mb-8">
          Confessions. Anonymous. Unfiltered. Judged.
        </h1>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem] relative">
          <span className="relative inline-block">
            {typedText}
            {showCursor && <span className="animate-pulse">|</span>}
            {/* Glitch slice overlays */}
            {isGlitching && typedText && (
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
                  {typedText}
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
                  {typedText}
                </span>
              </>
            )}
          </span>
        </p>
      </div>
      
      <div className="fixed bottom-36 left-0 right-0 flex justify-center px-6">
        <button 
          onClick={handleProceed}
          className="btn-booth"
        >
          BEGIN
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Confidentiality;
