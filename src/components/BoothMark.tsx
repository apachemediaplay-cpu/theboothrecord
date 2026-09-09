import { useId } from "react";

// ── THE BOOTH MARK ──────────────────────────────────────────────────────────
// ONE definition, imported everywhere the mark is drawn. It was copy-pasted
// into four files (the gate's opening, the share page, the receiving screen and
// the Untitled splash) with the geometry, the colour and the dot's position
// re-typed each time — which is how three of them ended up on a viewBox the
// fourth had already moved on from.
//
// THE SHAPE: an arch, open at the bottom, with a dot inside it. No base rule
// (the old mark had one), round stroke caps, and a viewBox that fits the ink
// rather than padding it — 100 × 117, so `width` alone sizes it correctly and
// the caller never has to know the ratio.
//
// COLOUR IS THE CALLER'S. Both the stroke and the dot are currentColor, so the
// mark takes the text colour of wherever it lands: ritual green on the gate and
// the share page, a muted bone on /receiving. Nothing in here names a colour.
//
// PARSED BY make_booth_reel.py. The brand reel reads the viewBox, the arch's
// d=, the stroke width and cap, and the dot's cx/cy/r straight out of this file
// rather than keeping its own copy — which it used to, and which left the reel
// rendering a mark the app had already replaced. Its booth_mark() matches on
// the className="booth-mark-arch" / "booth-mark-dot" attributes and the
// attribute ORDER below (d after the class; cx, cy, r in that order). Reshuffle
// those and the reel stops with a message rather than rendering the wrong logo,
// but it does stop — so if you move things here, run `python make_booth_reel.py
// --only tail` once to confirm it still parses.
//
// GLOW IS DROP-SHADOW, NEVER BOX-SHADOW — see `glow`. A box-shadow follows the
// element's BOX, so an arch glows as a rectangle with a bright rim and two lit
// corners where there is no ink at all. drop-shadow follows the rendered path,
// so the light comes off the arch itself.
export type BoothMarkProps = {
  /**
   * Rendered width; the height follows the viewBox. OPTIONAL AND UNSET BY
   * DEFAULT — an inline width would beat the caller's own class, which is how
   * the gate (176 → 288 at md) and the splash (132 → 168) size themselves.
   * Pass it only for a fixed-size mark; otherwise let a class own the width.
   */
  size?: string | number;
  /** Add the two-layer glow. Off by default — /receiving's mark is flat. */
  glow?: boolean;
  /**
   * A colour to FILL THE ARCH'S OPENING with. Unset by default, which leaves
   * the path `fill="none"` exactly as it has always been — every existing
   * caller renders byte-identically.
   *
   * WHAT IT IS FOR: `glow` is a drop-shadow, and a drop-shadow is a halo in
   * every direction, inward included. On a shape this closed the two inner
   * walls and the crown all throw light into the same small opening, and it
   * stops reading as a doorway and starts reading as a filled lozenge
   * (measured: +17 green over the page at the crown gap, from the arch alone).
   * Painting the opening in the PAGE'S OWN COLOUR takes that inward half back.
   *
   * Pass the background the mark is sitting on, not black: this covers what is
   * behind it. On a gradient or an image it will show as a patch.
   *
   * DO NOT PUT IT ON THE SAME COPY AS `glow`. It is tempting and it is wrong:
   * a drop-shadow is cast by the ALPHA of everything in the element, so filling
   * the opening turns a thin stroke into a solid blob and the mark starts
   * throwing a much bigger shadow. Inside the arch you never see it — the fill
   * is on top of it — but it pours out of the mouth, and the archway ends up
   * standing on a lit step (measured +39 green at the mouth against +5 for the
   * bare stroke). The occluder has to sit OUTSIDE the filtered element.
   *
   * So stack two: a glowing copy underneath for the light, and a copy with
   * `opening` on top for the shape. The second one paints fill, then stroke,
   * then dot, in that order, so the ink lands back over its own occluder and
   * only the inward glow is lost. UntitledSplash does exactly this and is the
   * reference.
   *
   * The fill FADES OUT over its last quarter, and that is not decoration. The
   * arch's path closes across the mouth at the top of the round caps, so a flat
   * occluder ends there while the legs keep glowing below it — a hard bright
   * line straight across the doorway (+15 green beside each leg, against +2 at
   * the centre, which is why it is easy to miss in the middle of the shape and
   * impossible to miss at the edges). Fading it hands the light back gradually,
   * and reads as the doorway spilling onto the floor. The stops are in
   * objectBoundingBox units, so they carry no coordinates and cannot fall out
   * of step with the path.
   */
  opening?: string;
  className?: string;
  style?: React.CSSProperties;
};

// TWO SHADOWS, NOT ONE: the near one (8px) gives the stroke its edge, the far
// one (26px) is the spread that reads as light in a dark room. A single shadow
// can do one or the other, never both — a tight one looks like a sticker, a
// wide one like fog.
//
// Fixed px, not em: em would resolve against whatever font-size the mark
// happens to sit in, which is a number nobody sets with the glow in mind. A
// caller drawing the mark very large can pass its own `filter` through `style`.
export const BOOTH_MARK_GLOW =
  "drop-shadow(0 0 8px rgba(0, 255, 30, 0.55)) drop-shadow(0 0 26px rgba(0, 255, 30, 0.3))";

const BoothMark = ({ size, glow = false, opening, className, style }: BoothMarkProps) => {
  // One id per instance. useId gives ":r0:", and a colon inside url(#…) reads as
  // a pseudo-class to a CSS parser, so strip them.
  const fadeId = `booth-opening-${useId().replace(/:/g, "")}`;
  return (
  <svg
    viewBox="0 0 100 117"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{
      // height:auto keeps the viewBox ratio, so a caller only ever sets width.
      height: "auto",
      // OVERFLOW VISIBLE, ALWAYS. An <svg> is overflow:hidden by UA default, so
      // anything a filter paints outside the viewBox is clipped — and a glow is
      // exactly that. The gate animates a drop-shadow on the DOT (a child), and
      // its 60px/98px spread was being cut into a hard rectangle the shape of
      // the 100×117 viewport: the mark glowed as a box.
      // Set HERE rather than on the one caller that hit it, because the next
      // caller to put a filter on .booth-mark-dot would hit it identically and
      // the symptom (a square glow) doesn't name its own cause.
      // Safe: the path and the circle both sit inside the viewBox, so nothing
      // new paints — only filters, which is the point.
      overflow: "visible",
      ...(size !== undefined ? { width: typeof size === "number" ? `${size}px` : size } : null),
      ...(glow ? { filter: BOOTH_MARK_GLOW } : null),
      ...style,
    }}
  >
    {opening !== undefined && (
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.74" stopColor={opening} stopOpacity="1" />
          <stop offset="1" stopColor={opening} stopOpacity="0" />
        </linearGradient>
      </defs>
    )}
    {/* Both parts carry a class so a caller can animate ONE of them — the
        gate pulses the dot while the arch holds still, and it can only do that
        if it can reach the dot. Nothing here styles them. */}
    <path
      className="booth-mark-arch"
      d="M5.75 111.25 V50 A44.25 44.25 0 0 1 94.25 50 V111.25"
      stroke="currentColor"
      strokeWidth="11.5"
      strokeLinecap="round"
      // FILL AND STROKE ON ONE ELEMENT, in that painting order, is what makes
      // `opening` cost a single attribute instead of a second hand-typed path:
      // the unclosed d= encloses the opening plus the inner half of the stroke,
      // and the stroke then paints over that inner half. No offset geometry to
      // keep in sync with the arch — there is only ever one set of numbers.
      fill={opening === undefined ? "none" : `url(#${fadeId})`}
    />
    <circle className="booth-mark-dot" cx="50" cy="65.5" r="13.5" fill="currentColor" />
  </svg>
  );
};

export default BoothMark;
