import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Receiving = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  
  const fullText = "Your sin is being received.";

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setIsThinking(true);
        
        // Keep text pulsing while "thinking", then navigate
        setTimeout(() => {
          setShowCursor(false);
          navigate("/verdict");
        }, 3500);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, [navigate]);

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex items-center justify-center">
        <p className={`text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem] ${isThinking ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}`}>
          {typedText}
          {showCursor && <span className="animate-pulse">|</span>}
        </p>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Receiving;
