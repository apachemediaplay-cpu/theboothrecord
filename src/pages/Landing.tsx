import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import potionIcon from "@/assets/potion-icon.png";

const Landing = () => {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background px-6">
      {/* Top section with headline */}
      <div className="flex-1 flex items-center pt-16">
        <h1 className="font-control text-4xl md:text-6xl font-bold leading-[1.1] text-foreground">
          If you know,
          <br />
          you know.
        </h1>
      </div>

      {/* Bottom section with logo and icon */}
      <div className="flex flex-col items-center gap-6 pb-20">
        <img
          src={guiltyLogoRed}
          alt="GUILTY"
          className="w-48 md:w-56 h-auto"
        />
        <div className="w-12 border-t border-muted-foreground" />
        <img
          src={potionIcon}
          alt=""
          className="w-10 h-auto"
        />
      </div>
    </div>
  );
};

export default Landing;
