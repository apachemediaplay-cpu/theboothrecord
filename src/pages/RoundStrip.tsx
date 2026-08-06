import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { getRound, markRevealed, ROUND_WORDS } from "@/lib/round";

// THE STRIP — all N together. Confessions truncate to ONE line (they're
// labels by now; everyone has read them on the reveal cards); verdicts show
// in full. The list may scroll — the reading-out is done by this point.
const RoundStrip = () => {
  const navigate = useNavigate();
  // Hold the screen awake — the brief holds the lock for the WHOLE round,
  // and GO AGAIN restarts from here.
  useWakeLock();
  const round = getRound();

  // Reaching the strip IS the round ending (see markRevealed): after this,
  // /confess is solo again and /round shows a fresh picker — while the store
  // survives so this screen's own back/forward keeps rendering.
  useEffect(() => {
    markRevealed();
  }, []);

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;

  return (
    // pb-8 overrides screen-container's pb-32: the strip is a terminal screen
    // with no fixed footer to clear, and five pairs need the room — the strip
    // must NOT scroll at five people on a 375×667 phone.
    <div className="screen-container animate-fade-in pb-8">
      <div className="flex-1 flex flex-col justify-center py-8">
        {/* Count header in RITUAL GREEN — THE BOOTH NOTICED's exact mono
            treatment and tracking, but NOT its words: the count is what makes
            the strip read as a conclusion rather than one more verdict screen. */}
        <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] uppercase mb-6">
          {ROUND_WORDS[round.size] ?? round.size} on record
        </p>
        {/* Pairs are a PREVIEW, not reading matter — everyone has just seen
            each one full size, one at a time. Confessions truncate to one
            line; verdicts show in full but small and tight. */}
        <div className="space-y-3">
          {round.slots.map((slot, i) => (
            <div key={i} className="min-w-0">
              <p className="truncate font-mono-light text-[10px] text-muted-foreground/80">
                {slot.confession}
              </p>
              <p className="font-control font-bold text-foreground text-xs leading-tight">
                {slot.status === "done" && slot.verdict ? slot.verdict : "Nothing on record."}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 w-full border-t border-muted-foreground/40 pt-6 flex flex-col items-center gap-4">
        {/* NO closing line above the share button — "Filed. Now you can all
            sort it." was removed and must not come back: the Booth states
            things and stops, it doesn't instruct. The screen is already an
            ending without a line saying so, and the table is already talking —
            a caption here describes something happening in front of them. */}
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
