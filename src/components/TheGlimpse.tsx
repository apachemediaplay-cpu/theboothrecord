import { useState, useEffect, useRef } from "react";
import glimpseImage from "@/assets/glimpse.png";

interface TheGlimpseProps {
  trigger?: boolean;
  onComplete?: () => void;
}

const TheGlimpse = ({ trigger = false, onComplete }: TheGlimpseProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggered = useRef(false);
  const imageLoaded = useRef(false);

  // Preload image on mount
  useEffect(() => {
    const img = new Image();
    img.src = glimpseImage;
    img.onload = () => {
      imageLoaded.current = true;
    };
  }, []);

  // Trigger the flash when trigger prop becomes true
  useEffect(() => {
    if (!trigger || hasTriggered.current) return;
    
    // Skip if reduced motion is enabled
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) {
      onComplete?.();
      return;
    }

    hasTriggered.current = true;

    // Small delay to ensure image is ready
    const startFlash = () => {
      // Flash duration: 80-120ms (slightly longer for visibility)
      const flashDuration = 80 + Math.random() * 40;

      setIsVisible(true);
      setTimeout(() => {
        setIsVisible(false);

        // 20% chance of second micro-flash
        if (Math.random() < 0.2) {
          const secondDelay = 150 + Math.random() * 100;
          setTimeout(() => {
            const microFlash = 40 + Math.random() * 20;
            setIsVisible(true);
            setTimeout(() => {
              setIsVisible(false);
              onComplete?.();
            }, microFlash);
          }, secondDelay);
        } else {
          onComplete?.();
        }
      }, flashDuration);
    };

    // If image already loaded, start immediately; otherwise wait a bit
    if (imageLoaded.current) {
      startFlash();
    } else {
      setTimeout(startFlash, 100);
    }
  }, [trigger, onComplete]);

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
