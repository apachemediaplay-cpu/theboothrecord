import BoothHeader from "../BoothHeader";
import BoothFooter from "../BoothFooter";

interface EntryScreenProps {
  onEnter: () => void;
}

const EntryScreen = ({ onEnter }: EntryScreenProps) => {
  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex flex-col justify-center">
        <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight text-foreground mb-8">
          Once you begin, you can't take it back."
        </h1>
        
        <p className="text-ritual text-xl font-mono-light tracking-wide">
          That's the point:
        </p>
      </div>
      
      <div className="mb-8">
        <button 
          onClick={onEnter}
          className="btn-booth"
        >
          ENTER
        </button>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default EntryScreen;
