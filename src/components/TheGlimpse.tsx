import { useState, useEffect, useRef } from "react";
import glimpseImage from "@/assets/glimpse.png";

const SESSION_KEY = "guilty_glimpse_shown";

const TheGlimpse = () => {
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    // Skip if reduced motion is enabled
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    // Skip if already shown this session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Preload the image
    const img = new Image();
    img.src = glimpseImage;

    img.onload = () => {
      if (hasTriggered.current) return;
      hasTriggered.current = true;

      // Random delay: 200-600ms (reduced to ensure it triggers before navigation)
      const initialDelay = 200 + Math.random() * 400;

      setTimeout(() => {
        // Flash duration: 60-80ms
        const flashDuration = 60 + Math.random() * 20;

        setIsVisible(true);
        setTimeout(() => {
          setIsVisible(false);

          // 15% chance of second micro-flash
          if (Math.random() < 0.15) {
            const secondDelay = 200 + Math.random() * 200;
            setTimeout(() => {
              const microFlash = 30 + Math.random() * 10;
              setIsVisible(true);
              setTimeout(() => setIsVisible(false), microFlash);
            }, secondDelay);
          }

          // Mark as shown for this session
          sessionStorage.setItem(SESSION_KEY, "true");
        }, flashDuration);
      }, initialDelay);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="glimpse-overlay">
      <img
        src={glimpseImage}
        alt=""
        aria-hidden="true"
        className="glimpse-image"
      />
      <div className="glimpse-noise" />
    </div>
  );
};

export default TheGlimpse;
