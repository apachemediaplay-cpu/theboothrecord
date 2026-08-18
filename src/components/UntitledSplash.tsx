import { useEffect, useState } from "react";
import BoothMark from "@/components/BoothMark";

// ── THE UNTITLED SPLASH ─────────────────────────────────────────────────────
// A collaboration opening for ONE venue: the booth's arch, ×, and UNTITLED.
// typing itself out. It REPLACES the standard opening mark for that source
// rather than queueing behind it — two openings back to back would be 5.2
// seconds before anyone can tap anything.
//
// NOTHING IS EVER PAINTED OVER THE WORDMARK. The glow reaches ~78px past the
// glyphs on every side; a cover, a clip-path or an overflow:hidden anywhere
// near it cuts that glow at an edge and the result reads as a frosted
// rectangle around the type. So the reveal is not a reveal at all — the text
// is APPENDED A CHARACTER AT A TIME to state on a 60ms interval, the way
// Index's headline and Receiving's loader already do it. There is no overlay
// in this component to get wrong.
//
// The container is held at the finished wordmark's width by a hidden sizer,
// with the live line centred in the same grid cell, so the lockup stays centred
// under the arch through every frame instead of growing out from the left.
const WORD = "UNTITLED.";
const TYPE_MS = 60; // the app's cadence — Index and Receiving both use it
const START_MS = 1000; // × has landed; the wordmark begins

const UntitledSplash = ({ fading }: { fading: boolean }) => {
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      let i = 0;
      interval = window.setInterval(() => {
        i += 1;
        setTyped(WORD.slice(0, i));
        if (i >= WORD.length) {
          window.clearInterval(interval);
          setDone(true);
        }
      }, TYPE_MS);
    }, START_MS);
    return () => {
      window.clearTimeout(start);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <style>{`
        .untitled-lockup { display: flex; flex-direction: column; align-items: center; }

        /* The mark comes from components/BoothMark — one definition, one shape.
           Only the box size, the fade-in and the glow live here. Height is auto
           off the viewBox, so setting width alone keeps the proportions. */
        .untitled-arch {
          width: 132px;
          opacity: 0;
          transform: scale(0.94);
          animation: untitledArchIn 600ms cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
        }
        @keyframes untitledArchIn { to { opacity: 1; transform: scale(1); } }

        /* × — the collaboration mark, not a letter of either name: dimmer than
           both so it reads as the join rather than a third word. */
        .untitled-x {
          margin-top: 22px;
          font-family: 'Control Upright', sans-serif;
          font-weight: 700;
          font-size: 20px;
          line-height: 1;
          color: rgba(255, 255, 255, 0.55);
          opacity: 0;
          animation: untitledFadeIn 400ms ease-out 800ms forwards;
        }
        @keyframes untitledFadeIn { to { opacity: 1; } }

        /* WIDTH = the finished wordmark, held by a hidden sizer in the same
           grid cell rather than a number typed in here: the tracking and the
           full stop's scale both change that width, and a hardcoded em would
           quietly stop centring the moment either is touched again.
           No overflow rule, no clip: the glow spills out of this box on
           purpose.
           TRACKING +0.01em, against Control's natural fit. The reference
           (untitledgroup.com.au) sets its name loose, not tight; at -0.02em
           ours read as compressed, which is most of what made the full stop
           look tucked under the D. */
        .untitled-markbox {
          margin-top: 18px;
          display: grid;
          justify-items: center;
          text-align: center;
          font-family: 'Control Upright', sans-serif;
          font-weight: 700;
          font-size: 40px;
          line-height: 1;
          letter-spacing: 0.01em;
          color: #ffffff;
          white-space: nowrap;
          text-shadow:
            0 0 4px rgba(255, 255, 255, 0.95),
            0 0 14px rgba(255, 255, 255, 0.7),
            0 0 38px rgba(220, 235, 255, 0.4),
            0 0 78px rgba(200, 225, 255, 0.22);
        }

        /* The sizer holds the box open at the finished wordmark's width; the
           live line sits in the same cell and is centred within it, so the
           lockup stays centred under the arch as it grows. */
        .untitled-sizer, .untitled-live {
          grid-area: 1 / 1;
        }
        .untitled-sizer {
          visibility: hidden;
          pointer-events: none;
        }

        /* THE FULL STOP, scaled. Control's period is 0.19em of ink against a
           0.21em stem (measured) — already close to a stem's width, but set
           small and, at negative tracking, tucked under the D. 1.35em makes it
           unmistakably a dot rather than a typographic afterthought. It sits on
           the baseline by construction: a period's ink rests there, and
           inline-block + vertical-align:baseline keeps the larger box seated
           the same way. */
        .untitled-dot {
          display: inline-block;
          vertical-align: baseline;
          font-size: 1.35em;
          line-height: 0;
          margin-left: 0.01em;
        }

        /* CARET — a separate element after the typed text, in the inline flow
           exactly like Receiving's .type-caret. 3px wide and the height of the
           capital letters only (0.75em, measured); vertical-align:baseline is
           what seats it ON the baseline rather than on the box. It carries no
           glow of its own — the shadow above is inherited by the box, and a
           caret with a 78px halo would smear the letter it sits beside. */
        .untitled-caret {
          display: inline-block;
          width: 3px;
          height: 0.75em;
          margin-left: 0.04em;
          vertical-align: baseline;
          background-color: #ffffff;
          text-shadow: none;
        }
        .untitled-caret[data-blink="true"] {
          animation: untitledCaretBlink 1.06s steps(1, end) infinite;
        }
        @keyframes untitledCaretBlink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }

        @media (min-width: 768px) {
          .untitled-arch { width: 168px; }
          .untitled-x { margin-top: 28px; font-size: 26px; }
          .untitled-markbox { margin-top: 24px; font-size: 56px; }
        }
      `}</style>

      <div className="untitled-lockup">
        <BoothMark glow className="untitled-arch text-[hsl(var(--ritual-green))]" />

        <span className="untitled-x">×</span>

        <div className="untitled-markbox">
          {/* Hidden, and the only thing that sets the box's width. */}
          <span className="untitled-sizer">
            {WORD.slice(0, -1)}
            <span className="untitled-dot">.</span>
          </span>
          <span className="untitled-live">
            {typed.endsWith(".") ? typed.slice(0, -1) : typed}
            {typed.endsWith(".") ? <span className="untitled-dot">.</span> : null}
            {/* Only once there is something to sit beside — a caret alone on an
                empty line for a second reads as a stalled screen, not a pause. */}
            {typed ? <span className="untitled-caret" data-blink={done} /> : null}
          </span>
        </div>
      </div>
    </div>
  );
};

export default UntitledSplash;
