// Screen wake lock for the confession flow — the receiving screen holds for
// 12–25s with no interaction, and on iOS the screen dims and can lock before
// the verdict lands.
//
// PER-SCREEN acquisition (each flow screen mounts this hook; reading screens
// never do), not one lock acquired at the gate and held across routes. The
// singleton is only simpler until release: it must know every exit route and
// release on each — miss one and the lock leaks onto a reading screen and
// drains the battery on the wall's infinite scroll. Per-screen makes "release
// explicitly when leaving the flow" structural: unmount IS leaving the screen,
// and the cleanup releases explicitly. The cost is one cheap request per
// screen; the ms-long gap between route transitions is irrelevant against a
// ~30s dim timer.
//
// iOS DROPS the lock when the tab is backgrounded and does NOT restore it on
// return — the visibilitychange listener re-requests when the document becomes
// visible again, or the lock silently stops working the first time someone
// checks a message mid-flow.
//
// Every path is try/caught and SILENT: the API is absent in older Safari
// (<16.4) and pre-126 Firefox, and browsers may refuse the request outright
// (low battery / power-save). A failure changes nothing — the flow works
// exactly as it does without the lock; the screen just dims as it always did.
import { useEffect } from "react";

type WakeLockSentinelLike = { release(): Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

export function useWakeLock() {
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const wl = (navigator as WakeLockNavigator).wakeLock;
        if (!wl) return; // API absent — silent no-op
        const s = await wl.request("screen");
        if (cancelled) {
          // Unmounted while the request was in flight — release immediately,
          // never hold a lock for a screen that's gone.
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
      } catch {
        // Refused (NotAllowedError: power-save, low battery, hidden document)
        // or any other failure — silent, no behaviour change.
      }
    };

    // Re-request on return to the tab: the UA auto-released the old sentinel
    // when the document went hidden, so overwriting it is safe.
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };

    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      // Explicit release on leaving the screen — not left to GC or the UA.
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, []);
}
