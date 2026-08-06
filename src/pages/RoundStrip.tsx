import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { getRound, ROUND_WORDS } from "@/lib/round";

// THE STRIP — all N together. Confessions truncate to ONE line (they're
// labels by now; everyone has read them on the reveal cards); verdicts show
// in full. The list may scroll — the reading-out is done by this point.
const RoundStrip = () => {
  const navigate = useNavigate();
  // Hold the screen awake — the brief holds the lock for the WHOLE round,
  // and GO AGAIN restarts from here.
  useWakeLock();
  const round = getRound();

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center py-8">
        <p className="text-[hsl(var(--state-blue)/0.75)] text-xs font-mono-light tracking-[0.2em] uppercase mb-6">
          {ROUND_WORDS[round.size] ?? round.size} on record
        </p>
        <div className="space-y-5">
          {round.slots.map((slot, i) => (
            <div key={i} className="min-w-0">
              <p className="truncate font-mono-light text-xs text-muted-foreground">
                {slot.confession}
              </p>
              <p className="font-control font-bold text-foreground text-sm leading-snug">
                {slot.status === "done" && slot.verdict ? slot.verdict : "Nothing on record."}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-4">
        {/* Grey mono caption — this action needs framing (see the rule). */}
        <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
          Filed. Now you can all sort it.
        </p>
        {/* SHARE THE ROUND — deliberately DISABLED: the strip card render is a
            separate job, briefed separately. The box holds the slot so the
            layout doesn't reflow when it lands. No glow on a dead control. */}
        <button
          disabled
          className="btn-booth border border-muted-foreground/40 bg-transparent text-[13px] text-muted-foreground/50 hover:bg-transparent disabled:opacity-60"
        >
          SHARE THE ROUND
        </button>
        <button
          onClick={() => navigate("/round")}
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          GO AGAIN
        </button>
      </div>
    </div>
  );
};

export default RoundStrip;
