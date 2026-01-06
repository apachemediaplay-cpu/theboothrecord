import BoothHeader from "../BoothHeader";
import BoothFooter from "../BoothFooter";
import { Camera, Mic } from "lucide-react";

interface ConfidentialityScreenProps {
  onProceed: () => void;
}

const ConfidentialityScreen = ({ onProceed }: ConfidentialityScreenProps) => {
  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col pt-16">
        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-4">
          The Booth
        </h2>
        
        <div className="flex items-center gap-2 mb-12">
          <div className="flex-1 border-t border-dashed border-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Confessions.</span> Anonymous. Unfiltered. No judgement.
          </p>
          <div className="flex-1 border-t border-dashed border-muted-foreground" />
        </div>
        
        <p className="text-ritual text-2xl font-mono-light tracking-wide">
          This stays between us…
        </p>
        
        <div className="flex-1" />
        
        <div className="flex justify-between items-center mb-8">
          <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
            <Camera size={28} strokeWidth={1.5} />
          </button>
          <button className="p-3 text-muted-foreground hover:text-foreground transition-colors">
            <Mic size={28} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      
      <div className="mb-8">
        <button 
          onClick={onProceed}
          className="btn-booth flex flex-col items-center gap-2"
        >
          <span>PROCEED</span>
          <span className="text-xs tracking-normal font-normal text-muted-foreground">
            " Not all sinners are equal."
          </span>
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default ConfidentialityScreen;
