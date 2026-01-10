import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Return = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  
  const fullText = 'The booth is listening…';

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
        }, 3500);
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
        <h1 className="font-control text-3xl md:text-6xl font-bold leading-tight text-foreground mb-8">
          Couldn't stay away?
        </h1>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem]">
          {typedText}
          {showCursor && <span className="animate-pulse">|</span>}
        </p>
      </div>
      
      <div className="fixed bottom-36 left-0 right-0 flex justify-center px-6">
        <button 
          onClick={handleProceed}
          className="btn-booth"
        >
          GO DEEPER
        </button>
      </div>
      
      <BoothFooter showConsent />
    </div>
  );
};

export default Return;
