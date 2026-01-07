import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import { Camera, ArrowRight } from "lucide-react";

const Confess = () => {
  const navigate = useNavigate();
  const [confession, setConfession] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (confession.trim()) {
      // Store confession in sessionStorage for potential future use
      sessionStorage.setItem("confession", confession);
      navigate("/receiving");
    }
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-muted-foreground text-sm mb-4 tracking-wide">
          What did you do?
        </p>
        
        <textarea
          ref={textareaRef}
          value={confession}
          onChange={(e) => setConfession(e.target.value)}
          placeholder="Begin."
          className="confession-input"
          rows={6}
        />
      </div>
      
      <div className="flex items-center justify-between mb-8">
        <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
          <Camera className="w-6 h-6" />
        </button>
        
        <button 
          onClick={handleSubmit}
          disabled={!confession.trim()}
          className="p-3 text-foreground disabled:text-muted-foreground disabled:opacity-50 transition-all"
        >
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default Confess;
