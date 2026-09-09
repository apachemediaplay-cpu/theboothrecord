import { useEffect, useState } from "react";
import BoothMark, { BOOTH_MARK_GLOW } from "@/components/BoothMark";

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
// is APPENDED A CHARACTER AT A TIME to state on an interval, the way Index's
// headline and Receiving's loader already do it. There is no overlay in this
// component to get wrong.
//
// ── THE FULL STOP IS THE CURSOR ─────────────────────────────────────────────
// There is no caret in this component and there never should be. Untitled's
// name ends in a full stop; a typing cursor is a mark that sits at the end of
// what has been typed so far. Those are the same position, so they are the
// same character — one glyph doing both jobs, present from the very first
// frame. The letters arrive BEHIND it and push it right; when they run out it
// stops moving and is simply their name. That transition — cursor becomes
// punctuation, with nothing appearing, disappearing or changing style — is the
// whole idea, and it only works if the dot was never a cursor ELEMENT.
//
// So `typed` counts LETTERS, 1..8, and the rendered string is always
// WORD.slice(0, n) + ".". U. UN. UNT. … UNTITLED.
//
// IT BEHAVES like the letters — same colour, same weight, no blink, never
// appended at the end — and it is SET like a wordmark's stop, at 1.35em (see
// .untitled-dot). Those are not in tension: the first is about the animation,
// the second about the type. What must never come back is a second ELEMENT
// standing in for a cursor.
const WORD = "UNTITLED"; // 8 letters; the full stop is appended every frame
const TYPE_MS = 130; // 8 × 130 = 1.04s of typing
const START_MS = 700; // × has landed; the wordmark begins

// THE BUDGET, door to door, must land inside 2–3s (Index owns the last two):
//    0 →  480   arch in
//  400 →  700   × fades in
//  700 → 1740   typing        8 × 130ms  = 1.04s
// 1740 → 2540   hold                     = 0.80s   (Index: holdMs 2540)
// 2540 → 2940   fade                     = 0.40s   (Index: outMs  2940)
//                                   TOTAL = 2.94s
// The hold is the beat where the dot stops being a cursor, so it is the one
// number that does not move; the arch and × were compressed (600/800 → 480/400)
// to pay for the slower, more legible 130ms keystroke inside the 3s ceiling.
const FADE_MS = 400;

const UntitledSplash = ({ fading }: { fading: boolean }) => {
  const [typed, setTyped] = useState(0); // letters shown, 0..WORD.length

  useEffect(() => {
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      let i = 0;
      interval = window.setInterval(() => {
        i += 1;
        setTyped(i);
        if (i >= WORD.length) window.clearInterval(interval);
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
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <style>{`
        .untitled-lockup { display: flex; flex-direction: column; align-items: center; }

        /* The mark comes from components/BoothMark — one definition, one shape.
           Only the box size, the fade-in and the glow live here. Height is auto
           off the viewBox, so setting width alone keeps the proportions.

           TWO COPIES OF ONE MARK, and the reason is in BoothMark's 'opening'
           note: the copy that glows must not be the copy that is filled, or the
           filled silhouette casts a far bigger shadow and it spills out of the
           mouth as a lit step. So — GLOW underneath, SHAPE on top, exactly
           registered. No geometry is duplicated by this; the component owns the
           path and both layers are the same call.
           The intro animation lives on the WRAPPER so the pair fades and scales
           as one thing. */
        .untitled-arch-wrap {
          position: relative;
          width: 132px;
          opacity: 0;
          transform: scale(0.94);
          animation: untitledArchIn 480ms cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
        }
        @keyframes untitledArchIn { to { opacity: 1; transform: scale(1); } }
        .untitled-arch { width: 100%; display: block; }
        .untitled-arch-ink { position: absolute; top: 0; left: 0; }

        /* THE DOT KEEPS ITS OWN LIGHT. The glow layer's dot is underneath the
           top layer's opaque fill, so its halo is occluded with the arch's. The
           dot on the TOP layer gets the same two shadows back as its own
           filter — a child filter renders with the child, after the fill, so
           the light lands on top of it. Same constant, so the dot and the mark
           can never drift apart. The mark glows outward; the dot glows into a
           dark room. */
        .untitled-arch-ink .booth-mark-dot { filter: ${BOOTH_MARK_GLOW}; }

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
          animation: untitledFadeIn 300ms ease-out 400ms forwards;
        }
        @keyframes untitledFadeIn { to { opacity: 1; } }

        /* FIXED WIDTH, AND THE TEXT IS NOT CENTRED IN IT.
           Centred text slides LEFT as it grows, which drags the full stop
           BACKWARDS while letters are being added in front of it — the exact
           opposite of the effect, where the letters push the dot right. So the
           box is held at the finished wordmark's width and the line is set
           flush left inside it. The dead space on the right is invisible on
           black, and the dot travels in one direction only.
           MEASURED ONCE, BY LAYOUT, NOT BY JS: the hidden sizer below carries
           the finished string in the same grid cell, so the column resolves to
           its width at first layout and never moves again — nothing is
           recomputed per keystroke, and the tracking, the font or the full
           stop's scale can change without a number in here going stale.
           justify-items: START is the fix; it was 'center', which is what put
           the live line in the middle of the column.
           No overflow rule, no clip: the glow spills out of this box on
           purpose.
           TRACKING +0.01em, against Control's natural fit. The reference
           (untitledgroup.com.au) sets its name loose, not tight; at -0.02em
           ours read as compressed, which is most of what made the full stop
           look tucked under the D. */
        .untitled-markbox {
          margin-top: 18px;
          display: grid;
          justify-items: start;
          text-align: left;
          font-family: 'Control Upright', sans-serif;
          font-weight: 700;
          font-size: 40px;
          line-height: 1;
          letter-spacing: 0.01em;
          color: #ffffff;
          white-space: nowrap;
          /* GLOW, TURNED UP ~40%. Every alpha x1.4; the four radii and the two
             cold tints on the outer layers are untouched, so this is the same
             light, brighter, not a different one. The near layer clips (0.95 x
             1.4 = 1.33 -> 1.00) and so only gains 5% — the extra reach comes
             from the middle two, which is where the eye reads a glow's
             strength anyway.
             Measured, ink-edge outward: +34.6% at 8px and +45.7% at 12px, mean
             +40.2%. Counter floors — the darkest pixel inside U, N and D, which
             is what white bloom closes first — rise from 86/70/89 over the page
             to 116/95/122, still well clear of the 255 ink. D is the tightest
             and is the one to watch if this ever goes up again. */
          text-shadow:
            0 0 4px rgba(255, 255, 255, 1),
            0 0 14px rgba(255, 255, 255, 0.98),
            0 0 38px rgba(220, 235, 255, 0.56),
            0 0 78px rgba(200, 225, 255, 0.31);
        }

        /* Both lines occupy the SAME grid cell, so the column is as wide as the
           wider of them — the sizer, always, since it carries the finished
           string and the live line is a prefix of it. That is the fixed width.
           (It used to be the live line that won: the caret hung off the end and
           made the typed line 4.6px WIDER than the finished wordmark, so the
           box grew on the last keystroke. Nothing to guard against now — there
           is no caret, and a prefix cannot outrun the whole.) */
        .untitled-sizer, .untitled-live {
          grid-area: 1 / 1;
        }
        .untitled-sizer {
          visibility: hidden;
          pointer-events: none;
        }

        /* THE FULL STOP, SCALED. Control's period is 0.19em of ink against a
           0.21em stem (measured) — near enough a stem's width, but set low and
           small, and at wordmark scale it reads as tucked under the D rather
           than as part of the name. Untitled's own lockup carries a heavy stop;
           1.35em is ours. This is TYPESETTING, not cursor styling: the glyph
           behaves exactly like the letters beside it — same colour, same
           weight, no blink — and it is present in every frame, including the
           first.
           It sits on the baseline by construction: a period's ink rests there,
           and inline-block + vertical-align:baseline keeps the larger box
           seated the same way. line-height:0 stops the bigger font-size from
           opening up the line box and shifting the whole wordmark down.
           The sizer carries this span too, so the fixed width above includes
           the scaled stop and the box does not grow on the last keystroke. */
        .untitled-dot {
          display: inline-block;
          vertical-align: baseline;
          font-size: 1.35em;
          line-height: 0;
          margin-left: 0.01em;
        }

        @media (min-width: 768px) {
          .untitled-arch-wrap { width: 168px; }
          .untitled-x { margin-top: 28px; font-size: 26px; }
          .untitled-markbox { margin-top: 24px; font-size: 56px; }
        }
      `}</style>

      <div className="untitled-lockup">
        <div className="untitled-arch-wrap">
          {/* 1. THE LIGHT — glow only, nothing filled, so the shadow is cast by
                 the stroke alone and the mark's silhouette is what it has
                 always been. */}
          <BoothMark glow className="untitled-arch text-[hsl(var(--ritual-green))]" />
          {/* 2. THE SHAPE — the same mark again, unfiltered, with the archway
                 painted in the page's own background. That covers layer 1's
                 inward halo and then draws the stroke and the dot back over it.
                 The colour has to be the real token and not black: this paints
                 over whatever is behind the mark. */}
          <BoothMark
            opening="hsl(var(--background))"
            className="untitled-arch untitled-arch-ink text-[hsl(var(--ritual-green))]"
          />
        </div>

        <span className="untitled-x">×</span>

        <div className="untitled-markbox">
          {/* Hidden, and the only thing that sets the box's width. Carries the
              scaled stop, so the width it holds is the finished wordmark's. */}
          <span className="untitled-sizer">
            {WORD}
            <span className="untitled-dot">.</span>
          </span>
          {/* n counts 1..8 — the dot is present from the wordmark's FIRST
              frame ("U.") and never appended at the end, but there is no
              frame 0. A lone full stop hanging under the × for the 700ms
              before the first letter is not a cursor waiting, it is a piece of
              punctuation on its own; it also lands before the webfont swaps,
              so it would place itself and then jump. */}
          <span className="untitled-live">
            {typed ? WORD.slice(0, typed) : null}
            {typed ? <span className="untitled-dot">.</span> : null}
          </span>
        </div>
      </div>
    </div>
  );
};

export default UntitledSplash;
