import BoothHeader from "../BoothHeader";
import BoothFooter from "../BoothFooter";

interface VerdictScreenProps {
  onConfessAgain: () => void;
}

const VerdictScreen = ({ onConfessAgain }: VerdictScreenProps) => {
  const handleGetLink = () => {
    if (navigator.share) {
      navigator.share({
        title: "GUILTY",
        text: "The booth noticed.",
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center items-center text-center">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">
          Petty crime. Elegant restraint.
        </h1>
        
        <p className="font-display text-2xl md:text-3xl text-foreground mb-4">
          The system forgot to feed you.
          <br />
          You improvised.
        </p>
        
        <p className="text-sm text-muted-foreground mt-4">
          The booth doesn't punish necessity.It rewards it.
        </p>
      </div>
      
      <div className="flex flex-col items-center gap-6 mb-8">
        <p className="text-sm text-muted-foreground">
          The booth noticed.
        </p>
        
        <button 
          onClick={onConfessAgain}
          className="btn-booth-outline max-w-xs"
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

export default VerdictScreen;
