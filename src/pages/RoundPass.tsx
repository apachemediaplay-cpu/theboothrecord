import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { isKioskSession } from "@/lib/source";
import { getRound } from "@/lib/round";

// PASS THE PHONE — shown between confessions, never after the last one (the
// submit handler routes the final person straight to Deliberating; the guard
// here covers browser-back and stale history entries). While this screen is
// up, the previous confession's generate-verdict call is already running in
// the round module — this screen waits for NOTHING.
const RoundPass = () => {
  const navigate = useNavigate();
  // Hold the screen awake for the whole round.
  useWakeLock();
  const [kiosk] = useState(() => isKioskSession());
  // 90s: this is the screen a table sits on while someone finishes their drink
  // and decides to take the device. Shorter would punish exactly the pause the
  // format is built around.
  const idleLeft = useKioskTimeout(90, "round_pass");
  const round = getRound();

  // No round (deep link / evaporated) → start over. All submitted (back
  // button after the last confession) → forward to the reveal pipeline.
  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;
  if (round.slots.length >= round.size) return <Navigate to="/round/deliberating" replace />;

  const filed = round.slots.length;
  const toGo = round.size - filed;

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        {/* Filing line — State Blue, the app's metadata colour. */}
        <p className="text-[hsl(var(--state-blue)/0.75)] text-xs font-mono-light tracking-[0.2em] uppercase">
          {filed} filed · {toGo} to go
        </p>
        {/* KIOSK COPY SWAP: on the booth's own tablet nobody passes a phone —
            the device stays on the table and the next person leans in. The
            phone wording would be a small lie about the object in front of
            them. Non-kiosk keeps the original line exactly. */}
        <h2 className="font-control text-4xl md:text-5xl font-bold text-foreground">
          {kiosk ? "Next person." : "Pass the phone."}
        </h2>
      </div>
      <div className="shrink-0 flex flex-col items-center gap-4">
        {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
            hairline, transparent — I'M NEXT is this screen's one action and
            says what it does, so no caption. Increments nothing itself: the
            round module knows the next index; Confess reads it on mount. */}
        <button
          onClick={() => navigate("/confess")}
          className="btn-booth border border-muted-foreground/40 bg-transparent text-[13px] hover:bg-transparent"
        >
          <span className="enter-glow-text text-[hsl(var(--ritual-green))]">I'M NEXT</span>
        </button>
        <p className="max-w-xs text-center text-[9.5px] leading-snug font-mono-light text-muted-foreground/70">
          18+ · your confession may be published anonymously
        </p>
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />
    </div>
  );
};

export default RoundPass;
