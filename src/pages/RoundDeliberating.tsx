import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { KioskStaffReset } from "@/hooks/useKioskTimeout";
import { getRound, roundSettled, subscribeRound, ROUND_WORDS } from "@/lib/round";

// DELIBERATING — its OWN component, not Receiving behind a flag. Receiving's
// core is solo through and through: it FIRES the request on mount (hard rule),
// owns the 35s ceiling, runs recovery, writes the five sessionStorage keys and
// navigates to /verdict. This screen fires nothing and owns no request — every
// call is already in flight in the round module; it only WAITS for the last
// slots to settle and advances. Sharing the component would mean gutting that
// mount effect behind a mode flag — a bigger risk to the untouched-solo rule
// than these few lines. Only the visual register is shared.
//
// Shown after the FINAL confession only, and only for as long as the last
// verdict takes — if everything is already settled on arrival it renders
// nothing and forwards immediately.
const RoundDeliberating = () => {
  const navigate = useNavigate();
  // Hold the screen awake — this is the round's only true wait.
  useWakeLock();
  const round = getRound();

  useEffect(() => {
    if (roundSettled()) {
      navigate("/round/reveal", { replace: true });
      return;
    }
    // Failed slots settle too (failure never blocks the round), so this
    // always fires once the stragglers resolve, recover, or time out.
    return subscribeRound(() => {
      if (roundSettled()) navigate("/round/reveal", { replace: true });
    });
  }, [navigate]);

  if (!round || round.slots.length === 0) return <Navigate to="/round" replace />;
  if (round.slots.length < round.size) return <Navigate to="/round/pass" replace />;
  if (roundSettled()) return null; // the effect forwards — skip entirely, no flash

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Receiving's visual register — the Booth reads, it never narrates
            progress. Static two lines; the caret carries the "alive" signal. */}
        <p className="text-ritual text-xl font-mono-light tracking-wide self-start text-left whitespace-pre-line">
          {ROUND_WORDS[round.size] ?? round.size} on record.{"\n"}Reading them now.
          <span className="type-caret" aria-hidden="true" />
        </p>
      </div>
      {/* Staff reset only — NO idle timer on this screen: it is the round's one
          true wait, and a countdown here would bin a table's confessions while
          the machine is still answering. */}
      <KioskStaffReset />
    </div>
  );
};

export default RoundDeliberating;
