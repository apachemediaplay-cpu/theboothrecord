import { useState, useEffect, useCallback } from "react";
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
  const [isGlitching, setIsGlitching] = useState(false);

  const getRandomDelay = () => 1200 + Math.random() * 3000;

  const triggerTransition = useCallback(() => {
    setIsGlitching(true);

    // Flicker a few times before settling
    const flickerCount = 2 + Math.floor(Math.random() * 4);
    let flickersDone = 0;
    const nextIcon = (prev: number) => (prev + 1) % icons.length;

    const flicker = () => {
      if (flickersDone < flickerCount) {
        setCurrentIcon((prev) => (Math.random() > 0.5 ? nextIcon(prev) : prev));
        flickersDone++;
        setTimeout(flicker, 50 + Math.random() * 80);
      } else {
        setCurrentIcon((prev) => nextIcon(prev));
        setTimeout(() => setIsGlitching(false), 150);
      }
    };

    flicker();
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        triggerTransition();
        schedule();
      }, getRandomDelay());
    };
    schedule();
    return () => clearTimeout(timeout);
  }, [triggerTransition]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black px-6">
      <div className="flex-1 flex items-center pt-16">
        <h1 className="font-control text-4xl md:text-6xl font-bold leading-[1.1] text-foreground">
          If you know,
          <br />
          you know.
        </h1>
      </div>

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
              className="absolute inset-0 w-10 h-10 object-contain transition-opacity duration-100"
              style={{
                opacity: currentIcon === index ? 1 : 0,
                filter: currentIcon === index && isGlitching
                  ? `drop-shadow(2px 0 0 rgba(237,71,35,0.8)) drop-shadow(-2px 0 0 rgba(0,200,255,0.6)) drop-shadow(0 2px 0 rgba(0,255,80,0.6))`
                  : 'none',
                transform: currentIcon === index && isGlitching
                  ? `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)`
                  : 'none',
              }}
            />
          ))}
          {/* Glitch slice overlay */}
          {isGlitching && (
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{
                clipPath: `inset(${30 + Math.random() * 30}% 0 ${10 + Math.random() * 20}% 0)`,
              }}
            >
              <img
                src={icons[currentIcon]}
                alt=""
                className="w-10 h-10 object-contain"
                style={{
                  transform: `translateX(${Math.random() * 8 - 4}px)`,
                  filter: 'drop-shadow(2px 0 0 rgba(237,71,35,0.9))',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Landing;
