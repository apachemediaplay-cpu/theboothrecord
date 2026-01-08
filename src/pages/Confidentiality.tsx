import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Confidentiality = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  
  const fullText = '"This stays between us…"';

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setShowCursor(false);
        
        // Auto-navigate after 2 seconds
        setTimeout(() => {
          navigate("/confess");
        }, 2000);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, []);

  const handleProceed = () => {
    navigate("/confess");
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
          The Booth
        </h2>
        
        <p className="text-muted-foreground text-lg mb-8">
          Confessions. Anonymous. Unfiltered. No judgement.
        </p>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem]">
          {typedText}
          {showCursor && <span className="animate-pulse">|</span>}
        </p>
      </div>
      
      <div className="fixed bottom-32 left-0 right-0 flex flex-col items-center gap-2">
        <button 
          onClick={handleProceed}
          className="btn-booth"
        >
          PROCEED
        </button>
        
        <p className="text-xs text-muted-foreground tracking-wide">
          " Not all sinners are equal."
        </p>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Confidentiality;
