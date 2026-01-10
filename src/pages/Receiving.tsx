import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Receiving = () => {
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  
  const fullText = "Your sin is being received.";

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setShowCursor(false);
        
        // Navigate after typing completes
        setTimeout(() => {
          navigate("/verdict");
        }, 1500);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, [navigate]);

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex items-center justify-center">
        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem]">
          {typedText}
          {showCursor && <span className="animate-pulse">|</span>}
        </p>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Receiving;
