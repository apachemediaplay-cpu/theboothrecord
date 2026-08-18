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

const BoothMark = ({ size, glow = false, className, style }: BoothMarkProps) => (
  <svg
    viewBox="0 0 100 117"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{
      // height:auto keeps the viewBox ratio, so a caller only ever sets width.
      height: "auto",
      ...(size !== undefined ? { width: typeof size === "number" ? `${size}px` : size } : null),
      ...(glow ? { filter: BOOTH_MARK_GLOW } : null),
      ...style,
    }}
  >
    {/* Both parts carry a class so a caller can animate ONE of them — the
        gate pulses the dot while the arch holds still, and it can only do that
        if it can reach the dot. Nothing here styles them. */}
    <path
      className="booth-mark-arch"
      d="M5.75 111.25 V50 A44.25 44.25 0 0 1 94.25 50 V111.25"
      stroke="currentColor"
      strokeWidth="11.5"
      strokeLinecap="round"
      fill="none"
    />
    <circle className="booth-mark-dot" cx="50" cy="65.5" r="13.5" fill="currentColor" />
  </svg>
);

export default BoothMark;
