import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Index = () => {
  const navigate = useNavigate();
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [showCursor1, setShowCursor1] = useState(true);
  const [showCursor2, setShowCursor2] = useState(false);

  const fullText1 = "Once you begin, you can't take it back.";
  const fullText2 = "That's the point.";

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
            }
          }, 60);
        }, 400);
      }
    }, 50);

    return () => clearInterval(typeText1);
  }, []);

  const handleEnter = () => {
    navigate("/confidentiality");
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <h1 className="font-control text-5xl md:text-6xl font-bold leading-tight text-foreground mb-8">
          {text1}
          {showCursor1 && <span className="animate-pulse">|</span>}
        </h1>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide min-h-[1.75rem]">
          {text2}
          {showCursor2 && <span className="animate-pulse">|</span>}
        </p>
      </div>
      
      <div className="fixed bottom-32 left-0 right-0 flex justify-center">
        <button 
          onClick={handleEnter}
          className="btn-booth"
        >
          ENTER
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Index;
