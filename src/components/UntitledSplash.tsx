// ── THE UNTITLED SPLASH ─────────────────────────────────────────────────────
// A collaboration opening for ONE venue: the booth's arch, ×, and UNTITLED.
// typing itself out. It REPLACES the standard opening mark for that source
// rather than queueing behind it — two openings back to back would be 5.5
// seconds before anyone can tap anything.
//
// WHERE IT RUNS: non-kiosk, ?source=untitled, motion allowed. The booth's own
// gate reaches "live" on the first frame and must stay that way (the mark and
// the typewriter were removed there deliberately — a queue pays that cost once
// per person), so kiosk never mounts this.
//
// THE REVEAL IS A MOVING COVER, NOT A CLIP. The wordmark's glow reaches ~78px
// past the glyphs; inside an overflow:hidden or clip-path container that glow
// is cut at the container edge and reads as a frosted rectangle around the
// text. So the wordmark is drawn in full, at its finished width, and a
// background-coloured cover slides off it in steps(9) — one step per character
// of "UNTITLED." — extending far enough past the text on every side that no
// unrevealed glow escapes.
//
// The cover therefore also passes over the × and the arch above it. Both are
// lifted above it with z-index rather than the cover being made shorter: a
// cover short enough to clear the × is a cover that leaks glow.
//
// EVERY NUMBER BELOW IS MEASURED, not guessed. Control Upright Bold at
// letter-spacing -0.02em: cap height 0.75em, baseline 0.125em up from the box
// bottom at line-height 1, "UNTITLED." 4.607em wide. The caret is sized and
// seated from those three figures.
const UntitledSplash = ({ fading }: { fading: boolean }) => (
  <div
    aria-hidden="true"
    className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-500 ${
      fading ? "opacity-0" : "opacity-100"
    }`}
  >
    <style>{`
      /* ── The lockup ─────────────────────────────────────────────────────── */
      .untitled-lockup { display: flex; flex-direction: column; align-items: center; }

      /* Arch: the existing mark's geometry untouched — width : height = 0.85,
         base 1.2× the arch width — carried by the viewBox, so the only thing
         set here is the box size. z-index lifts it clear of the cover. */
      .untitled-arch {
        position: relative;
        z-index: 2;
        width: 132px;
        height: 132px;
        opacity: 0;
        transform: scale(0.94);
        animation: untitledArchIn 600ms cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
      }
      @keyframes untitledArchIn {
        to { opacity: 1; transform: scale(1); }
      }

      /* × — the collaboration mark, not a letter of either name: dimmer than
         both so it reads as the join rather than a third word. */
      .untitled-x {
        position: relative;
        z-index: 2;
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

      /* The wordmark box is FIXED at the finished width (4.607em) so the cover's
         100% is the end of the text and the caret lands exactly past the full
         stop. line-height 1 makes the box exactly 1em tall, which is what puts
         the baseline 0.125em up from its bottom edge. */
      .untitled-markbox {
        position: relative;
        margin-top: 18px;
        font-family: 'Control Upright', sans-serif;
        font-weight: 700;
        font-size: 40px;
        line-height: 1;
        letter-spacing: -0.02em;
        width: 4.607em;
        height: 1em;
      }
      .untitled-word {
        position: absolute;
        inset: 0;
        white-space: nowrap;
        color: #ffffff;
        text-shadow:
          0 0 4px rgba(255, 255, 255, 0.95),
          0 0 14px rgba(255, 255, 255, 0.7),
          0 0 38px rgba(220, 235, 255, 0.4),
          0 0 78px rgba(200, 225, 255, 0.22);
      }

      /* THE COVER. Background-coloured, well past the text on all sides (2em ≈
         80px at this size, past the 78px outer glow), sliding its LEFT edge
         0 → 100% of the finished wordmark in nine steps. */
      .untitled-cover {
        position: absolute;
        z-index: 1;
        left: 0;
        right: -4em;
        top: -2em;
        bottom: -2em;
        background: hsl(var(--background));
        animation: untitledReveal 540ms steps(9, end) 1000ms forwards;
      }
      @keyframes untitledReveal { to { left: 100%; } }

      /* THE CARET — its own element, never the cover's border: as a border it
         inherited the cover's full height and stood far taller than the type.
         3px wide, the capital letters' height (0.75em), sitting ON the baseline
         (0.125em up from the box bottom). Same steps(9) on the same delay, so
         it rides the cover's edge; blinks once the typing lands. */
      .untitled-caret {
        position: absolute;
        z-index: 3;
        left: 0;
        bottom: 0.125em;
        width: 3px;
        height: 0.75em;
        background: #ffffff;
        opacity: 0;
        animation:
          untitledReveal 540ms steps(9, end) 1000ms forwards,
          untitledCaretOn 1ms linear 1000ms forwards,
          untitledCaretBlink 1.06s steps(1, end) 1540ms infinite;
      }
      @keyframes untitledCaretOn { to { opacity: 1; } }
      @keyframes untitledCaretBlink {
        0%, 50% { opacity: 1; }
        50.01%, 100% { opacity: 0; }
      }

      @media (min-width: 768px) {
        .untitled-arch { width: 168px; height: 168px; }
        .untitled-x { margin-top: 28px; font-size: 26px; }
        .untitled-markbox { margin-top: 24px; font-size: 56px; }
      }
    `}</style>

    <div className="untitled-lockup">
      <svg className="untitled-arch" viewBox="0 0 240 240">
        <path
          d="M58.5 210 L58.5 109 A61.5 61.5 0 0 1 181.5 109 L181.5 210"
          fill="none"
          stroke="hsl(var(--ritual-green))"
          strokeWidth="31"
        />
        <rect x="32" y="210" width="175" height="18" fill="hsl(var(--ritual-green))" />
        <circle cx="120" cy="161" r="19" fill="hsl(var(--ritual-green))" />
      </svg>

      <span className="untitled-x">×</span>

      <div className="untitled-markbox">
        <span className="untitled-word">UNTITLED.</span>
        {/* Cover before caret in the DOM AND below it in z-index: the caret has
            to ride on top of the cover's leading edge, which is the whole point
            of it. */}
        <span className="untitled-cover" />
        <span className="untitled-caret" />
      </div>
    </div>
  </div>
);

export default UntitledSplash;
