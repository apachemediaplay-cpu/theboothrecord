import { useState } from "react";
import EntryScreen from "@/components/screens/EntryScreen";
import ConfidentialityScreen from "@/components/screens/ConfidentialityScreen";
import ConfessionInputScreen from "@/components/screens/ConfessionInputScreen";
import ReceivingScreen from "@/components/screens/ReceivingScreen";
import VerdictScreen from "@/components/screens/VerdictScreen";

type Screen = "entry" | "confidentiality" | "confession" | "receiving" | "verdict";

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>("entry");

  const handleEnter = () => {
    setCurrentScreen("confidentiality");
  };

  const handleProceed = () => {
    setCurrentScreen("confession");
  };

  const handleSubmitConfession = (confession: string) => {
    console.log("Confession submitted:", confession);
    setCurrentScreen("receiving");
  };

  const handleReceivingComplete = () => {
    setCurrentScreen("verdict");
  };

  const handleConfessAgain = () => {
    setCurrentScreen("entry");
  };

  return (
    <div className="min-h-screen bg-background">
      {currentScreen === "entry" && (
        <EntryScreen onEnter={handleEnter} />
      )}
      {currentScreen === "confidentiality" && (
        <ConfidentialityScreen onProceed={handleProceed} />
      )}
      {currentScreen === "confession" && (
        <ConfessionInputScreen onSubmit={handleSubmitConfession} />
      )}
      {currentScreen === "receiving" && (
        <ReceivingScreen onComplete={handleReceivingComplete} />
      )}
      {currentScreen === "verdict" && (
        <VerdictScreen onConfessAgain={handleConfessAgain} />
      )}
    </div>
  );
};

export default Index;
