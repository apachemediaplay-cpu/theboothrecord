import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { getRound, roundSettled } from "@/lib/round";

// REVEAL — one verdict per screen, N times. One at a time is what keeps the
// whole table reading the same thing at the same moment, and it means a long
// verdict never overflows. Same proportions as the solo verdict screen.
// The index is plain component state: by the time this screen mounts every
// slot has settled (Deliberating guarantees it; the guard below re-asserts),
// so the data is static and back/forward just re-enters at the first card.
const RoundReveal = () => {
  const navigate = useNavigate();
  // Hold the screen awake — reveals are read aloud, taps can be slow.
  useWakeLock();
  // 90s: verdicts are read aloud here and the table talks between cards.
  const idleLeft = useKioskTimeout(90, "round_reveal");
  const round = getRound();
  const [idx, setIdx] = useState(0);

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;
  if (!roundSettled()) return <Navigate to="/round/deliberating" replace />;

  const slot = round.slots[Math.min(idx, round.slots.length - 1)];
  const last = idx >= round.slots.length - 1;

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        {/* Stamp + counter on one line — stamp in ritual (the share page's
            treatment), counter in State Blue metadata. */}
        <div className="mb-3 flex w-full items-baseline justify-between">
          <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] uppercase">
            The booth noticed.
          </p>
          <p className="text-[hsl(var(--state-blue)/0.75)] text-[11px] font-mono-light tracking-[0.2em] uppercase">
            {idx + 1} of {round.slots.length}
          </p>
        </div>
        <p className="text-muted-foreground text-base font-mono-light whitespace-pre-wrap mb-8">
          {slot.confession}
        </p>
        {slot.status === "done" && slot.verdict ? (
          <p className="font-control font-bold text-[#F4F0EA] text-2xl md:text-3xl leading-tight">
            {slot.verdict}
          </p>
        ) : (
          // Failed / timed-out slot: the solo timeout's copy, reused. The
          // round CONTINUES — NEXT advances past it like any other card.
          <p className="font-control font-bold text-foreground text-2xl md:text-3xl leading-tight">
            Nothing on record.
          </p>
        )}
      </div>
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center">
        {/* THE PRIMARY-ACTION RULE (see index.css). The last card's button
            changes job, so it changes label: SEE THEM ALL → the strip. */}
        <button
          onClick={() => (last ? navigate("/round/strip") : setIdx((i) => i + 1))}
          className="btn-booth border border-muted-foreground/40 bg-transparent text-[13px] hover:bg-transparent"
        >
          <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
            {last ? "SEE THEM ALL" : "NEXT →"}
          </span>
        </button>
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />
    </div>
  );
};

export default RoundReveal;
