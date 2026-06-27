import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BoothFooter from "@/components/BoothFooter";
import { supabase } from "@/integrations/supabase/client";

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

        // Generate the verdict via our own Supabase Edge Function.
        // (The confession is persisted to Supabase later, at the verdict stage,
        //  so it can be saved together with the source tag and optional email.)
        const confession = sessionStorage.getItem("confession") || "";

        supabase.functions
          .invoke("generate-verdict", { body: { confession } })
          .then(({ data, error }) => {
            if (error || !data?.verdict) {
              throw error ?? new Error("No verdict returned");
            }
            sessionStorage.setItem("verdictResponse", data.verdict);
            setShowCursor(false);
            navigate("/verdict");
          })
          .catch(() => {
            sessionStorage.setItem("verdictResponse", "The booth could not process your confession. Try again.");
            setShowCursor(false);
            navigate("/verdict");
          });
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, [navigate]);

  return (
    <div className="screen-container animate-fade-in">
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
