import { useEffect } from "react";
import BoothHeader from "../BoothHeader";
import BoothFooter from "../BoothFooter";

interface ReceivingScreenProps {
  onComplete: () => void;
}

const ReceivingScreen = ({ onComplete }: ReceivingScreenProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="screen-container animate-fade-in">
      <BoothHeader />
      
      <div className="flex-1 flex items-center justify-center">
        <p className="font-display text-2xl md:text-3xl text-foreground text-center">
          "Your sin is being received."
        </p>
      </div>
      
      <BoothFooter />
    </div>
  );
};

export default ReceivingScreen;
