import { useState, useEffect } from "react";
import guiltyLogoRed from "@/assets/guilty-logo-red.svg";
import potionIcon from "@/assets/potion-icon.png";
import iconNun from "@/assets/icon-nun.png";
import iconPrayer from "@/assets/icon-prayer.png";
import iconChicken from "@/assets/icon-chicken.png";
import iconGun from "@/assets/icon-gun.png";
import iconSkiMask from "@/assets/icon-ski-mask.png";

const icons = [potionIcon, iconNun, iconPrayer, iconChicken, iconGun, iconSkiMask];

const Landing = () => {
  const [currentIcon, setCurrentIcon] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIcon((prev) => (prev + 1) % icons.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
        <div className="relative w-10 h-10">
          {icons.map((icon, index) => (
            <img
              key={index}
              src={icon}
              alt=""
              className="absolute inset-0 w-10 h-10 object-contain transition-opacity duration-700"
              style={{ opacity: currentIcon === index ? 1 : 0 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Landing;
