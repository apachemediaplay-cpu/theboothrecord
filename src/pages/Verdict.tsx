import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Verdict = () => {
  const navigate = useNavigate();

  const handleGetLink = () => {
    if (navigator.share) {
      navigator.share({
        title: "GUILTY",
        text: "The booth noticed.",
        url: window.location.origin,
      });
    } else {
      navigator.clipboard.writeText(window.location.origin);
    }
  };

  const handleConfessAgain = () => {
    sessionStorage.removeItem("confession");
    navigate("/");
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center items-start text-left">
        <h1 className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6">
          Petty crime. Elegant restraint.
        </h1>
        
        <p className="font-control text-3xl md:text-4xl font-bold text-foreground mb-2">
          The system forgot to feed you.
        </p>
        <p className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6">
          You improvised.
        </p>
        
        <p className="text-sm text-muted-foreground">
          The booth doesn't punish necessity. It rewards it.
        </p>
      </div>
      
      <div className="flex flex-col items-center gap-6 mb-8">
        <p className="text-sm text-muted-foreground">
          The booth noticed.
        </p>
        
        <button 
          onClick={handleConfessAgain}
          className="w-full max-w-xs py-4 text-xs tracking-[0.15em] bg-transparent text-foreground border border-foreground transition-all hover:bg-foreground hover:text-background"
        >
          CONFESS AGAIN GO DEEPER
        </button>
        
        <button 
          onClick={handleGetLink}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
        >
          GET LINK
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default Verdict;
