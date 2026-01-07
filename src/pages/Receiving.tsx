import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BoothHeader from "@/components/BoothHeader";
import BoothFooter from "@/components/BoothFooter";

const Receiving = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/verdict");
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigate]);

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

export default Receiving;
