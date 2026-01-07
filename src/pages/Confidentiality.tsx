import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";
import { Camera, Mic } from "lucide-react";

const Confidentiality = () => {
  const navigate = useNavigate();

  const handleProceed = () => {
    navigate("/confess");
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
          The Booth
        </h2>
        
        <p className="text-muted-foreground text-lg mb-8">
          Confessions. Anonymous. Unfiltered. No judgement.
        </p>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide mb-12">
          "This stays between us…"
        </p>
        
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Camera className="w-5 h-5" />
            <span className="text-sm">Off</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mic className="w-5 h-5" />
            <span className="text-sm">Off</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-4 mb-8">
        <button 
          onClick={handleProceed}
          className="btn-booth"
        >
          PROCEED
        </button>
        
        <p className="text-xs text-muted-foreground tracking-wide">
          Not all sinners are equal.
        </p>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Confidentiality;
