import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { startRound } from "@/lib/round";
import LegalLinks from "@/components/LegalLinks";

// HOW MANY — the round's entry screen. Tapping a number IS the consent (same
// mechanism as BEGIN on the gate), because "by tapping BEGIN" doesn't cover a
// table of N people; the line below the numbers says so explicitly. Capped at
// 5 — six verdicts makes the strip scroll badly.
const RoundStart = () => {
  const navigate = useNavigate();
  // Hold the screen awake for the whole round, this screen included.
  useWakeLock();

  const begin = (size: number) => {
    // The tap is the consent — identical key to BEGIN's, so the /confess
    // consent gate passes for every person in the round.
    sessionStorage.setItem("consent", "1");
    startRound(size);
    navigate("/confess");
  };

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-2">
          <p className="text-muted-foreground text-base font-mono-light tracking-wide">
            Nobody sees a verdict until everyone's confessed.
          </p>
          <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground">
            How many of you?
          </h2>
        </div>
        {/* Four equal options, not one primary — no glow, no single box. The
            hairline is the app's one line language (see the rule in index.css);
            the numbers are mono like every functional control. */}
        <div className="flex items-center gap-3">
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => begin(n)}
              className="h-16 w-16 border border-muted-foreground/40 bg-transparent font-mono-light text-xl text-foreground transition-colors hover:border-muted-foreground/70 hover:bg-transparent"
            >
              {n}
            </button>
          ))}
        </div>
        <p className="max-w-xs text-center text-[9.5px] leading-snug font-mono-light text-muted-foreground/70">
          By tapping a number you agree, for everyone at the table, that you're all 18+ and
          confessions may be published anonymously. <LegalLinks />.
        </p>
      </div>
    </div>
  );
};

export default RoundStart;
