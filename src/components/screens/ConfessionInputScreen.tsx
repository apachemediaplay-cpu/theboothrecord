import { useState, useRef, useEffect } from "react";
import BoothHeader from "../BoothHeader";
import { Camera, ArrowUp } from "lucide-react";

interface ConfessionInputScreenProps {
  onSubmit: (confession: string) => void;
}

const ConfessionInputScreen = ({ onSubmit }: ConfessionInputScreenProps) => {
  const [confession, setConfession] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = () => {
    if (confession.trim()) {
      onSubmit(confession);
    }
  };

  const isEmpty = confession.trim().length === 0;

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="pt-16">
        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-4">
          The Booth
        </h2>
        
        <div className="flex items-center gap-2 mb-8">
          <div className="flex-1 border-t border-dashed border-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Confessions.</span> Anonymous. Unfiltered. No judgement.
          </p>
          <div className="flex-1 border-t border-dashed border-muted-foreground" />
        </div>
      </div>
      
      <div className="flex-1">
        <textarea
          ref={textareaRef}
          value={confession}
          onChange={(e) => setConfession(e.target.value)}
          placeholder={isEmpty ? "Add a confession to continue" : ""}
          className="confession-input min-h-[200px]"
          rows={8}
        />
      </div>
      
      <div className="flex justify-between items-center py-4">
        <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
          <Camera size={28} strokeWidth={1.5} />
        </button>
        <button 
          onClick={handleSubmit}
          disabled={isEmpty}
          className={`p-3 rounded-full transition-all duration-300 ${
            isEmpty 
              ? "bg-muted text-muted-foreground cursor-not-allowed" 
              : "bg-foreground text-background hover:opacity-90"
          }`}
        >
          <ArrowUp size={24} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default ConfessionInputScreen;
