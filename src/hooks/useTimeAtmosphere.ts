import { useMemo } from "react";

export function useTimeAtmosphere() {
  return useMemo(() => {
    const hour = new Date().getHours();
    const isLateNight = hour >= 22 || hour < 5;
    return {
      scanLineOpacity: isLateNight ? 0.06 : 0.03,
      movingScanOpacity: isLateNight ? 0.1 : 0.06,
      scanLineDuration: isLateNight ? "12s" : "8s",
      pulseDuration: isLateNight ? "2s" : "3s",
      isLateNight,
    };
  }, []);
}
