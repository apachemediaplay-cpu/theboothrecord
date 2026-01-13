import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Verdict = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isGlitching, setIsGlitching] = useState(false);
  const [isButtonGlitching, setIsButtonGlitching] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchOffset2, setGlitchOffset2] = useState(0);
  const [glitchTop, setGlitchTop] = useState(30);
  const [glitchTop2, setGlitchTop2] = useState(60);
  const [btnGlitchOffset, setBtnGlitchOffset] = useState(0);
  const [btnGlitchOffset2, setBtnGlitchOffset2] = useState(0);
  const [btnGlitchTop, setBtnGlitchTop] = useState(30);
  const [btnGlitchTop2, setBtnGlitchTop2] = useState(60);
  const glitchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const btnGlitchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const fullText = "The booth noticed.";

  const triggerGlitch = () => {
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8);
    const top = 15 + Math.random() * 20;
    const offset2 = -offset * (0.5 + Math.random() * 0.5);
    const top2 = 55 + Math.random() * 25;
    
    setGlitchOffset(offset);
    setGlitchTop(top);
    setGlitchOffset2(offset2);
    setGlitchTop2(top2);
    setIsGlitching(true);
    
    const duration = 100 + Math.random() * 80;
    setTimeout(() => {
      setIsGlitching(false);
    }, duration);
  };

  const triggerButtonGlitch = () => {
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8);
    const top = 15 + Math.random() * 20;
    const offset2 = -offset * (0.5 + Math.random() * 0.5);
    const top2 = 55 + Math.random() * 25;
    
    setBtnGlitchOffset(offset);
    setBtnGlitchTop(top);
    setBtnGlitchOffset2(offset2);
    setBtnGlitchTop2(top2);
    setIsButtonGlitching(true);
    
    const duration = 100 + Math.random() * 80;
    setTimeout(() => {
      setIsButtonGlitching(false);
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
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, []);

  // Random glitch interval for text
  useEffect(() => {
    if (typedText.length === fullText.length) {
      const scheduleGlitch = () => {
        const delay = 2000 + Math.random() * 3000;
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

  // Random glitch interval for button
  useEffect(() => {
    const scheduleButtonGlitch = () => {
      const delay = 3000 + Math.random() * 4000;
      btnGlitchIntervalRef.current = setTimeout(() => {
        triggerButtonGlitch();
        scheduleButtonGlitch();
      }, delay);
    };
    scheduleButtonGlitch();
    
    return () => {
      if (btnGlitchIntervalRef.current) {
        clearTimeout(btnGlitchIntervalRef.current);
      }
    };
  }, []);

  const handleGetLink = () => {
    if (navigator.share) {
      navigator.share({
        title: "GUILTY",
        text: "The booth noticed.",
        url: window.location.origin,
      });
    } else {
      navigator.clipboard.writeText(window.location.origin);
    }
  };

  const handleConfessAgain = () => {
    sessionStorage.removeItem("confession");
    navigate("/return");
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-48">
        <p className="text-ritual text-xl font-mono-light tracking-wide mb-6 min-h-[1.75rem] relative">
          <span className="relative inline-block">
            {typedText}
            {showCursor && <span className="animate-pulse">|</span>}
            {/* Glitch slice overlays */}
            {isGlitching && typedText && (
              <>
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
        
        <h1 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6">
          Petty crime. Elegant restraint.
        </h1>
        
        <p className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
          The system forgot to feed you.
        </p>
        <p className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6">
          You improvised.
        </p>
        
        <p className="text-sm text-muted-foreground">
          The booth doesn't punish necessity. It rewards it.
        </p>
      </div>
      
      <div className="fixed bottom-20 left-0 right-0 px-6 flex flex-col items-center gap-6">
        <button 
          onClick={handleConfessAgain}
          className="btn-booth relative overflow-hidden"
        >
          <span className="relative inline-block">
            CONFESS AGAIN
            {isButtonGlitching && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute left-0 w-full"
                  style={{
                    top: 0,
                    transform: `translateX(${btnGlitchOffset}px)`,
                    clipPath: `inset(${btnGlitchTop}% 0 ${100 - btnGlitchTop - 20}% 0)`,
                    textShadow: '2px 0 #ff0000, -2px 0 #00ffff',
                  }}
                >
                  CONFESS AGAIN
                </span>
                <span
                  aria-hidden="true"
                  className="absolute left-0 w-full"
                  style={{
                    top: 0,
                    transform: `translateX(${btnGlitchOffset2}px)`,
                    clipPath: `inset(${btnGlitchTop2}% 0 ${100 - btnGlitchTop2 - 15}% 0)`,
                    textShadow: '-2px 0 #ff0000, 2px 0 #00ffff',
                  }}
                >
                  CONFESS AGAIN
                </span>
              </>
            )}
          </span>
        </button>
        
        
        <button 
          onClick={() => navigate("/summon")}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
        >
          SUMMON SOMEONE
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Verdict;
