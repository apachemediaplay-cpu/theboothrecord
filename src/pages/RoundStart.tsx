import { Navigate, useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { isKioskSession } from "@/lib/source";
import { getRound, startRound } from "@/lib/round";
import LegalLinks from "@/components/LegalLinks";

// HOW MANY — the round's entry screen. Tapping a number IS the consent (same
// mechanism as BEGIN on the gate), because "by tapping BEGIN" doesn't cover a
// table of N people; the line below the numbers says so explicitly. Capped at
// 5 — six verdicts makes the strip scroll badly.
const RoundStart = () => {
  const navigate = useNavigate();
  // Hold the screen awake for the whole round, this screen included.
  useWakeLock();
  // Kiosk idle + staff reset, same as every other booth screen. 60s here — the
  // picker is a two-second decision; a table that hasn't tapped in a minute has
  // walked off. (No-op on a phone.)
  const idleLeft = useKioskTimeout(60, "round_start");

  // A running round with anything FILED owns the flow — back/forward landing
  // here must not show a picker whose number tap would nuke filed confessions.
  // Forward to the round's current phase instead. A 0-slot round renders the
  // picker normally (backing out to change the count loses nothing), and a
  // REVEALED round does too — that's GO AGAIN's path.
  // KIOSK NEVER SHOWS THIS SCREEN. The gate asks "How many of you?" now, so a
  // second picker one tap later is the same question twice — and the booth has
  // no way to reach this route in normal use (the reveal's GO AGAIN goes to
  // the gate). The route and the phone's path are untouched: this is a
  // redirect for a URL nobody on the booth can type, not a deletion.
  if (isKioskSession()) return <Navigate to="/" replace />;

  const existing = getRound();
  if (existing && !existing.revealed && existing.slots.length > 0) {
    return (
      <Navigate
        to={existing.slots.length < existing.size ? "/confess" : "/round/deliberating"}
        replace
      />
    );
  }

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
            No verdict until everyone's confessed.
          </p>
          <h2 className="font-control text-3xl md:text-4xl font-bold text-foreground">
            How many of you?
          </h2>
        </div>
        {/* Four equal options, not one primary — no single box. The hairline is
            the app's one line language (see the rule in index.css); the numbers
            are mono like every functional control. The labels glow WHITE on
            begin-glow-text (BEGIN's exact curve, 2.8s, reduced-motion-gated in
            the class) and IN SYNC, never staggered: a light travelling through
            options reads as a spinner and implies the light landing somewhere
            matters. It doesn't. Synced says every option is live; sequential
            says watch this. */}
        {/* TWO AND THREE ONLY. startRound still clamps 2–5 and the strip still
            lays out five — deliberately untouched, so a 4 or 5 arriving from an
            old session or a future brief still works. The PICKER is the
            narrowing: at a table, four people passing one device is where the
            format stops being a round and starts being a queue. */}
        <div className="flex items-center gap-3">
          {[2, 3].map((n) => (
            <button
              key={n}
              onClick={() => begin(n)}
              className="h-16 w-16 border border-muted-foreground/40 bg-transparent font-mono-light text-xl text-foreground transition-colors hover:border-muted-foreground/70 hover:bg-transparent"
            >
              <span className="begin-glow-text">{n}</span>
            </button>
          ))}
        </div>
        <p className="max-w-xs text-center text-[9.5px] leading-snug font-mono-light text-muted-foreground/70">
          By tapping a number you agree, for everyone at the table, that you're all 18+ and
          confessions may be published anonymously. <LegalLinks />.
        </p>
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />
    </div>
  );
};

export default RoundStart;
