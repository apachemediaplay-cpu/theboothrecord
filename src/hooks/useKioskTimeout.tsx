import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isKioskSession } from "@/lib/source";
import { logBoothEvent } from "@/lib/metrics";
import { resetBoothSession } from "@/lib/reset";

// ── STAFF RESET ─────────────────────────────────────────────────────────────
// A 3-second long-press in the bottom-left corner clears the booth and returns
// it to the gate, for the case the timers can't cover: someone leaves the
// screen mid-confession and the next person is already waiting, or a member of
// staff needs the device back NOW.
//
// NO VISIBLE AFFORDANCE, deliberately — it is for the people who work here, and
// a labelled RESET button on a confession booth is an invitation to press it.
// The long press is the whole security model: 3 seconds is far past an
// accidental brush and far short of anything anyone would discover by fidget.
//
// BOTTOM-LEFT because it is the one corner empty on all four screens it mounts
// on: /confess puts the send arrow bottom-right, /verdict's actions are
// centred, and Held and Blocked are centred single columns. The idle line sits
// bottom-CENTRE and is pointer-events-none, so the two never fight.
const STAFF_HOLD_MS = 3000;
const STAFF_TARGET = 80; // px square — thumb-sized, still nothing to look at

export const KioskStaffReset = () => {
  const navigate = useNavigate();
  const [kiosk] = useState(() => isKioskSession());
  const timer = useRef<number | null>(null);

  if (!kiosk) return null;

  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // Same exit as the idle timeout — reset, then the gate. NOT logged as a
      // kiosk_timeout: nobody walked away, staff intervened, and conflating
      // the two would put staff actions in the abandonment numbers.
      resetBoothSession();
      navigate("/");
    }, STAFF_HOLD_MS);
  };

  return (
    <div
      aria-hidden="true"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className="fixed bottom-0 left-0 z-[60]"
      style={{ width: STAFF_TARGET, height: STAFF_TARGET }}
    />
  );
};

// ── KIOSK IDLE TIMEOUT ──────────────────────────────────────────────────────
// The booth's device has to return itself to the gate when someone walks away
// mid-confession — nobody hands it back. KIOSK ONLY: on a phone this hook does
// nothing at all (no listeners, no timer, no render), so every non-kiosk screen
// stays byte-identical.
//
// NOT on /blocked. That screen is the safe state — someone who just wrote
// something serious does not get the device yanked out from under them on a
// timer. Close is the only exit there, deliberately.
//
// The last WARN_AT seconds surface as a fading line: opacity is computed from
// the seconds remaining and re-rendered once a second. NO CSS animation — a
// pulsing warning would read as urgency, and this is meant to read as the room
// quietly closing.
const WARN_AT = 5;

export function useKioskTimeout(seconds: number, screen: string): number | null {
  const navigate = useNavigate();
  // Read ONCE: a session cannot become a kiosk (or stop being one) mid-screen,
  // and freezing it keeps the effect's identity stable.
  const [kiosk] = useState(() => isKioskSession());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadline = useRef(0);
  const fired = useRef(false);

  useEffect(() => {
    if (!kiosk) return;
    const reset = () => {
      deadline.current = Date.now() + seconds * 1000;
      setSecondsLeft((cur) => (cur === null ? cur : null));
    };
    reset();

    const events = ["pointerdown", "keydown", "touchstart", "wheel", "input"];
    for (const e of events) window.addEventListener(e, reset, { passive: true });

    const tick = window.setInterval(() => {
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      if (left > WARN_AT) {
        setSecondsLeft((cur) => (cur === null ? cur : null));
        return;
      }
      if (left > 0) {
        setSecondsLeft(left);
        return;
      }
      if (fired.current) return;
      fired.current = true;
      window.clearInterval(tick);
      logBoothEvent("kiosk_timeout", sessionStorage.getItem("source"), { screen });
      resetBoothSession();
      navigate("/");
    }, 1000);

    return () => {
      window.clearInterval(tick);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [kiosk, seconds, screen, navigate]);

  return kiosk ? secondsLeft : null;
}

// The fading line itself — one copy, both screens. Opacity steps with the
// seconds remaining (1.0 → 0.2 across the final WARN_AT seconds) and nothing
// moves. Fixed to the bottom so it never reflows the screen it sits over.
export const KioskIdleLine = ({ secondsLeft }: { secondsLeft: number | null }) =>
  secondsLeft === null ? null : (
    <div className="pointer-events-none fixed inset-x-0 bottom-10 flex justify-center">
      <p
        className="text-muted-foreground text-[11px] font-mono-light tracking-[0.2em] uppercase"
        style={{ opacity: 0.2 + (Math.max(0, secondsLeft) / WARN_AT) * 0.8 }}
      >
        Closing the booth
      </p>
    </div>
  );
