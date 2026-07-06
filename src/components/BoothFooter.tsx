import GuiltyLogo from "./GuiltyLogo";

const BoothFooter = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 pb-6 pt-4 flex flex-col items-center gap-4 bg-gradient-to-t from-background via-background to-transparent">
      <GuiltyLogo />
    </div>
  );
};

export default BoothFooter;
