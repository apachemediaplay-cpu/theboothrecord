import { useEffect, useRef, useState } from "react";
import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";

// ── POST TO STORY crop step: drag-and-pinch a photo into the card's PRINT
// frame — 968×1520, the inset photo area of the print-on-a-mount layout, NOT
// the full 9:16 card (the band below the print holds the type). HAND-ROLLED
// rather than a library, deliberately: one fixed aspect, one gesture pair
// (pan + pinch, unified under Pointer Events), one constraint (cover-fit) —
// ~100 lines, against a dependency whose aspect switching, rotation and grid
// overlays would all go unused. The frame IS the guide — it shows the crop
// instead of describing it.
// The transform lives in PRINT pixels: s = print px per photo px (≥ cover
// scale so the frame is always filled), ox/oy = photo origin in print space.
// Display maps print px → screen px by a single measured factor.
const StoryPhotoCrop = ({
  img,
  busy,
  onUse,
  onBack,
}: {
  img: HTMLImageElement;
  busy: boolean;
  onUse: (photo: HTMLCanvasElement) => void;
  onBack: () => void;
}) => {
  const W = 968; // print width: 1080 - 2×56 margins
  const H = 1520; // just above the tallest print this layout produces
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cover = Math.max(W / iw, H / ih);
  // DEFAULT: centred at minimum zoom — as much of their photo as the frame
  // can hold, so most people never touch it: they see the frame, it's
  // roughly what they shot, they tap through. Any adjustment is a choice,
  // not a requirement — the crop is a step on the path to sharing, not a
  // design tool, and every gesture it demands is friction at the moment the
  // impulse to share is most fragile.
  // Deliberately NO composition grid or framing guide beyond the stamp
  // ghost: guides work where there is a correct answer (face in the oval,
  // document in the rectangle) and there is no correct way to photograph a
  // room. The photo is already taken by this point — the real quality lever
  // is RETAKE on the preview screen.
  const [t, setT] = useState(() => ({
    s: cover,
    ox: (W - iw * cover) / 2,
    oy: (H - ih * cover) / 2,
  }));
  const boxRef = useRef<HTMLDivElement>(null);
  const [disp, setDisp] = useState(0.25); // screen px per card px
  // Track the box's real size with a ResizeObserver — a one-shot measure
  // could catch clientWidth 0 (overlay still laying out → photo stuck at
  // scale(0), invisible) or a pre-shift width (fonts landing grew the box
  // ~2px after mount → the photo ran short of the frame edge). Never accept
  // 0: the bake (use()) works in print space and was never affected, but
  // the user couldn't see what they were framing.
  useEffect(() => {
    const measure = () => {
      const w = boxRef.current?.clientWidth ?? 0;
      if (w > 0) setDisp(w / W);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  // Cover-fit clamp: the photo may never expose the frame edge.
  const clamp = (n: { s: number; ox: number; oy: number }) => {
    const s = Math.min(Math.max(n.s, cover), cover * 5);
    return {
      s,
      ox: Math.min(0, Math.max(n.ox, W - iw * s)),
      oy: Math.min(0, Math.max(n.oy, H - ih * s)),
    };
  };

  // Active pointers in card px; two pointers = pinch (scale about the
  // midpoint), one = pan. Wheel zooms about the cursor for desktop.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const toCard = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / disp, y: (e.clientY - r.top) / disp };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, toCard(e));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const prev = ptrs.current.get(e.pointerId)!;
    const cur = toCard(e);
    if (ptrs.current.size === 1) {
      setT((old) => clamp({ ...old, ox: old.ox + (cur.x - prev.x), oy: old.oy + (cur.y - prev.y) }));
    } else if (ptrs.current.size === 2) {
      const other = [...ptrs.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
        const mx = (cur.x + other.x) / 2;
        const my = (cur.y + other.y) / 2;
        setT((old) => {
          const k = d0 > 0 ? d1 / d0 : 1;
          const s = Math.min(Math.max(old.s * k, cover), cover * 5);
          const g = s / old.s;
          return clamp({ s, ox: mx - (mx - old.ox) * g, oy: my - (my - old.oy) * g });
        });
      }
    }
    ptrs.current.set(e.pointerId, cur);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    const c = toCard(e);
    setT((old) => {
      const k = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      const s = Math.min(Math.max(old.s * k, cover), cover * 5);
      const g = s / old.s;
      return clamp({ s, ox: c.x - (c.x - old.ox) * g, oy: c.y - (c.y - old.oy) * g });
    });
  };

  // Bake the crop to the card's full resolution. This canvas is the ONLY
  // thing that leaves this component — the photo itself stays on the device.
  const use = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#171513";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, t.ox, t.oy, iw * t.s, ih * t.s);
    onUse(c);
  };

  return (
    <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-5">
      {/* The frame fills as much of the viewport as its aspect allows,
          leaving only what USE THIS PHOTO and back need below (~210px with
          the overlay padding): pinch-and-drag done one-handed in a dark room
          needs precision more than anywhere else in the flow, and a small
          frame makes it fiddly. Width binds on phones (full width minus the
          overlay's 24px gutters); height binds on wide screens.
          100dvh + the safe-area inset, matching the overlay: sized against
          100vh the frame budgets for a viewport ~100px taller than what iOS
          Safari shows with its toolbar up, and the controls below get pushed
          under the chrome. */}
      {/* Hairline as an inset OUTLINE, not a border: box-sizing is border-box,
          so a border would make the content box a slightly different aspect
          than 968/1520 and the photo would run 1-2px short of the frame edge.
          An outline draws over the photo without touching the geometry. */}
      <div
        ref={boxRef}
        className="relative overflow-hidden outline outline-1 -outline-offset-1 outline-muted-foreground/40 touch-none select-none"
        style={{
          width:
            "min(100vw - 48px, (100dvh - 210px - env(safe-area-inset-bottom)) * 0.6635)",
          aspectRatio: "968 / 1520",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img
          src={img.src}
          alt=""
          draggable={false}
          className="pointer-events-none max-w-none"
          style={{
            width: iw,
            height: ih,
            transformOrigin: "0 0",
            transform: `translate(${t.ox * disp}px, ${t.oy * disp}px) scale(${t.s * disp})`,
          }}
        />
        {/* THE STAMP, shown exactly as it lands — same relative position and
            size as the finished card (nominal box 34px in from the print's
            right edge, 41px up from its bottom, 340/968 wide — see the card
            renderer), at FULL opacity. It was faded first (28%, then 55%) to say "preview, not
            final" — but it IS final, that is precisely where the mark lands,
            and the faintness read as an unfinished logo, creating the
            confusion it was meant to prevent. At full strength the mark
            explains itself and needs no label — and NO LABELS is the rule on
            this screen (see the layout note below). The mark's position is
            fixed, so showing it during framing lets people compose around
            it — it prevents the one bad outcome (the mark landing on the
            subject) and makes the mark feel composed with rather than
            applied afterwards. Display-only DOM overlay: the baked crop
            (use() above) draws background + photo and nothing else, so this
            can never reach the exported card. The minimal layout's print
            height varies with the verdict (bake 1520 > every print), so the
            card takes a centred slice and the real mark rides slightly
            higher than shown — ~10px on the tallest print, more as the
            verdict grows. Accepted for a guide. */}
        <img
          src={guiltyWordmark}
          alt=""
          draggable={false}
          className="pointer-events-none absolute"
          style={{
            width: `${((340 / 968) * 100).toFixed(2)}%`,
            right: `${((34 / 968) * 100).toFixed(2)}%`,
            bottom: `${((41 / 1520) * 100).toFixed(2)}%`,
            opacity: 1,
            transform: "rotate(-10deg)",
          }}
        />
      </div>
      {/* NO LABELS on this screen — "drag to reframe" and "the stamp lands
          here" were both considered and REJECTED: drag and pinch on a photo
          is the most learned gesture on a phone, and instructional text
          makes a three-element screen read as a form. The crop screen is
          photo, button, back. Nothing else. */}
      {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, hairline,
          transparent — the same slot every action screen uses. */}
      <button
        onClick={use}
        disabled={busy}
        className="btn-booth block w-full max-w-xs border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
      >
        <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
          {busy ? "BUILDING…" : "USE THIS PHOTO"}
        </span>
      </button>
      <button
        onClick={onBack}
        disabled={busy}
        className="text-[13px] text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide"
      >
        back
      </button>
    </div>
  );
};

export default StoryPhotoCrop;
