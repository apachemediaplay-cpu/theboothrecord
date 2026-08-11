import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useState, useEffect, useRef } from "react";
import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";
import { resolveVenueDisplayName, mayStampVenue } from "@/lib/source";
import {
  logShare,
  logBoothEvent,
  resolveShareId,
  fetchSharedVerdict,
} from "@/lib/metrics";
import { useToast } from "@/hooks/use-toast";

// Feature flag: email capture is temporarily OFF but kept in code so it can be
// switched back on later. NOTE: persistence now happens server-side in the
// generate-verdict Edge Function, which has no email field — re-enabling email
// will require adding email to the function/RPC, not a client-side insert.
const ENABLE_EMAIL_CAPTURE = false;

// ── POST TO STORY crop step: drag-and-pinch a photo into the card's PRINT
// frame — 968×1459, the inset photo area of the print-on-a-mount layout, NOT
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
  const H = 1459; // print height at its 76% maximum
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cover = Math.max(W / iw, H / ih);
  const [t, setT] = useState(() => ({
    s: cover,
    ox: (W - iw * cover) / 2,
    oy: (H - ih * cover) / 2,
  }));
  const boxRef = useRef<HTMLDivElement>(null);
  const [disp, setDisp] = useState(0.25); // screen px per card px
  useEffect(() => {
    if (boxRef.current) setDisp(boxRef.current.clientWidth / W);
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
      <div
        ref={boxRef}
        className="relative overflow-hidden border border-muted-foreground/40 touch-none select-none"
        style={{ width: "min(75vw, 34vh)", aspectRatio: "968 / 1459" }}
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
      </div>
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

const Verdict = () => {
  const navigate = useNavigate();
  // Hold the screen awake on this flow screen (released on unmount / absent
  // API / refusal are all silent) — see useWakeLock.
  useWakeLock();
  const { toast } = useToast();
  const [sharingLink, setSharingLink] = useState(false);
  // stamp_venue for THIS confession, seeded from what the Edge Function returned (stored by
  // Receiving). FAIL CLOSED: only an explicit true permits stamping — undefined means "not
  // positively confirmed" and suppresses the venue on the POST TO STORY card.
  const [stampVenue, setStampVenue] = useState<boolean | undefined>(
    sessionStorage.getItem("stampVenue") === "true" ? true : undefined,
  );
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [glitchOffset2, setGlitchOffset2] = useState(0);
  const [glitchTop, setGlitchTop] = useState(30);
  const [glitchTop2, setGlitchTop2] = useState(60);
  const glitchIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confession = sessionStorage.getItem("confession") || "";
  const verdictResponse = sessionStorage.getItem("verdictResponse") || "";
  const subjectNumber = sessionStorage.getItem("subjectNumber") || "";
  const fullText = "The booth noticed.";

  // Share card "AS CHARGED AT" venue, resolved from the PERSISTED ROW SOURCE only — the
  // ?venue= URL param is never trusted for display. venues.json first (unchanged, no DB
  // call for existing venues), then the active-only venues-table fallback for
  // console-added venues; unknown slug / inactive row / any error → "" → the card
  // renders LOCATION WITHHELD. The venue stamp is decided at POST TO STORY time so the
  // card is rendered once with the correct value — see handleOnRecordConfirm.
  // suppress === true → "" → LOCATION WITHHELD (no lookup at all).
  const rowSource = sessionStorage.getItem("verdictSource") || "";
  const computeFiledVenue = async (suppress: boolean) =>
    (suppress ? "" : await resolveVenueDisplayName(rowSource)).toUpperCase();

  // Feature 2: optional email capture — gated behind ENABLE_EMAIL_CAPTURE, kept for later.
  // (Dormant: confessions are now saved by the Edge Function, which has no email field.)
  const [email, setEmail] = useState("");
  const [claimState, setClaimState] = useState<"idle" | "saving" | "claimed" | "skipped">("idle");

  // ON RECORD share flow (single-tap: the disclosure line is the consent)
  const [sharing, setSharing] = useState(false);

  // True once the user taps EITHER share action. Set on tap, not on success: the Web
  // Share API can't reliably confirm completion and SAVE IMAGE gives no iOS callback.
  // Gates the post-share Instagram reveal; the share block stays visible regardless.
  const [hasShared, setHasShared] = useState(false);

  // This confession's share uuid. Resolved once (owner-gated) and reused by BOTH share
  // paths: SHARE VERDICT sends /v/{uuid} as the link; SAVE IMAGE sends the same /v/{uuid}
  // as the url travelling alongside the PNG. Cached so repeat taps don't re-resolve.
  const [shareId, setShareId] = useState<string | null>(null);

  // ── POST TO STORY photo step. STATE, not a route, deliberately: the flow's
  // core input is a decoded image held in memory — it can't cross a route
  // boundary without persisting it somewhere, and this feature's contract is
  // that the photo NEVER leaves the device (no upload, no storage, no
  // moderation — nothing but this component's memory and the PNG handed to
  // the share sheet). A route would also be deep-linkable into a state with
  // no verdict behind it. The step sits ON THE PATH of POST TO STORY rather
  // than as a side button: options nobody finds are worth nothing, and the
  // venue benefit (their room in a stranger's story) depends on uptake.
  const [story, setStory] = useState<
    | { step: "choose" }
    | { step: "crop"; img: HTMLImageElement }
    | { step: "preview"; blob: Blob; url: string }
    | null
  >(null);
  // Object URL for the picked photo + the uuid resolved when the card was
  // rendered (the preview share needs it for the travelling /v/ link).
  const storyPhotoUrl = useRef<string | null>(null);
  const storyUuid = useRef<string | null>(null);

  const handleClaim = () => {
    const value = email.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!valid) return;
    // TODO: persistence requires email support in the Edge Function/RPC (see note above).
    setClaimState("claimed");
  };

  const handleSkipEmail = () => {
    setClaimState("skipped");
  };

  const triggerGlitch = () => {
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 8);
    const top = 15 + Math.random() * 20;
    const offset2 = -offset * (0.5 + Math.random() * 0.5);
    const top2 = 55 + Math.random() * 25;

    setGlitchOffset(offset);
    setGlitchTop(top);
    setGlitchOffset2(offset2);
    setGlitchTop2(top2);
    setIsGlitching(true);

    const duration = 100 + Math.random() * 80;
    setTimeout(() => setIsGlitching(false), duration);
  };

  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typeInterval);
        setShowCursor(false);
      }
    }, 60);

    return () => clearInterval(typeInterval);
  }, []);

  // Random glitch interval for the "The booth noticed." line
  useEffect(() => {
    if (typedText.length === fullText.length) {
      const scheduleGlitch = () => {
        const delay = 2000 + Math.random() * 3000;
        glitchIntervalRef.current = setTimeout(() => {
          triggerGlitch();
          scheduleGlitch();
        }, delay);
      };
      scheduleGlitch();
    }

    return () => {
      if (glitchIntervalRef.current) clearTimeout(glitchIntervalRef.current);
    };
  }, [typedText]);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  // CONFESS AGAIN — quiet link in BOTH states: a missed verdict never gets
  // shared, so a post-share-only link would be unreachable by the people most
  // likely to want a re-roll. Plain navigate: NO sessionStorage clear here (the
  // clear lives in Confess.tsx's handleSubmit and NOWHERE else — the mount-clear
  // bug recorded there destroyed unshared verdicts) and NO prefill (that's the
  // timeout-recovery route, where the machine lost their words; here they're
  // choosing to write a new one).
  const handleConfessAgain = () => {
    logBoothEvent("confess_again", rowSource);
    navigate("/confess");
  };

  // --- ON RECORD share card generation (1080×1920 PNG) ---

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // TWO RENDERERS, ONE CARD: this canvas renderer (POST TO STORY, drawn
  // client-side) and functions/src/card.mjs (the /v/ link's OG image, rendered
  // server-side) draw the same card independently — a change to one needs the
  // same change in the other, or they drift. They have drifted twice already
  // (footer handle, both times). The footers are now ALIGNED — handle over
  // theboothrecord.com, one step dimmer — and must stay so: this card is the
  // MORE untappable of the two (it lands in an Instagram Story with no link,
  // no preview, no way to act on it — the address is the only route back;
  // the OG card at least sits on a link someone has already tapped).
  // Aligned means CONTENT AND TREATMENT, not position: this footer rides
  // ~160px higher than the OG card's, clear of Instagram's bottom-250px
  // story safe zone (see the footer note below). The OG card is a link
  // preview with no safe zone — do not raise it to match.
  // photo: an optional pre-cropped 1080×1920 canvas (StoryPhotoCrop's output —
  // the user's own picture, which NEVER leaves the device: it exists only in
  // memory here and in the PNG the share sheet hands off). With a photo the
  // card is a different composition (photo → wash → stamp group → plate);
  // without one, the code below the branch runs UNCHANGED — skipping the
  // photo step produces exactly the card that existed before this feature.
  const generateShareCard = async (filedVenue: string, photo?: HTMLCanvasElement): Promise<Blob> => {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // Make sure custom fonts are ready before drawing.
    try {
      await document.fonts.ready;
      await Promise.all([
        document.fonts.load("300 42px 'Söhne Mono'"),
        document.fonts.load("400 28px 'Söhne Mono'"),
        document.fonts.load("700 70px 'Control Upright'"),
      ]);
    } catch {
      /* fall back to whatever is available */
    }

    const setLS = (v: string) => {
      try {
        (ctx as unknown as { letterSpacing: string }).letterSpacing = v;
      } catch {
        /* letterSpacing unsupported — ignore */
      }
    };

    const pad = 110;
    const maxW = W - pad * 2;

    // Neon stamp (State Blue) — shared by both compositions; hoisted above the
    // photo branch. See the AS CHARGED comment below for the layering approach.
    const drawNeonStamp = (text: string, x: number, y: number) => {
      const layers: [number, string][] = [
        [2.8, "rgba(52,155,189,0.97)"],
        [10, "rgba(52,155,189,0.68)"],
        [26, "rgba(52,155,189,0.47)"],
      ];
      ctx.fillStyle = "rgb(120,205,235)"; // core stays brighter than the halo
      for (const [blur, color] of layers) {
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.fillText(text, x, y);
      }
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillText(text, x, y);
    };

    if (photo) {
      // ── PHOTO COMPOSITION: A PRINT ON A MOUNT ───────────────────────
      // The photo is an inset print with visible edges — an object, not a
      // background — so nothing sits over it except the stamp, and nothing
      // below it needs a plate: the card's own background IS the mount.
      // Draw order: mount (full-card background) → photo (inset, AS SHOT —
      // no wash, no grade, no grain; a film grade was tested and looks
      // right, left out for now so the layout is judged on its own) →
      // stamp on the photo → band type on the mount.
      // THE BOOTH NOTICED, SUBJECT # and the handle stay ABSENT (the photo
      // replaces them); the band holds confession → verdict → address.
      ctx.fillStyle = "#171513";
      ctx.fillRect(0, 0, W, H);

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";

      // Frame geometry: 56px margins on left, right AND top — the equal
      // three-sided border against the thick band below is what makes this
      // read as a print on a mount rather than a photo cropped by the frame.
      // The photo tops out at 76% of the card and gives ground to the band
      // as the text needs it — the verdict steps down (54 → 46 → 40) before
      // the photo does.
      // THE BAND CLEARS INSTAGRAM'S CHROME: every line's bottom stays above
      // y=1670 — the same safe-zone line the no-photo footer respects — so
      // the verdict never sits under the reply bar. That constraint outranks
      // the old 70% photo preference: spacing was tightened first
      // (44/26/24 → 36/20/18), the verdict steps down second, and the photo
      // yields last — in the extreme (longest live verdict + max-length
      // confession) it can settle around 65%. A 55% hard guard backstops
      // absurd inputs.
      const inset = 56;
      const photoTop = 56;
      const photoW = W - inset * 2; // 968 — the crop step bakes exactly this
      const photoMaxH = Math.round(H * 0.76); // 1459
      const photoPrefH = Math.round(H * 0.7); // step the verdict before shrinking past this
      const photoGuardH = Math.round(H * 0.55); // absolute floor, unreachable for real content
      const bandBottom = H - 250; // 1670 — the safe-zone line, hard
      const bandGapTop = 36; // photo bottom → confession
      const confSize = 28;
      const confLH = 38;
      const confToVerdict = 20;
      // Footer row: AT <VENUE> (28px, State Blue neon) left, the address
      // (20px, grey) right, ONE baseline. The URL's drop from 24-ish to 20
      // is what creates the hierarchy — verdict loudest, confession second,
      // filing row quietest; without it the confession and URL tie for last.
      // URL, not an Instagram handle: the card travels outside Instagram and
      // the URL goes to the Booth itself rather than a feed about it.
      const venueSize = 28;
      const urlSize = 20;
      const footerGap = 18; // last verdict line → footer row
      const confessionText = sessionStorage.getItem("confession") || "";
      ctx.font = `300 ${confSize}px 'Söhne Mono', monospace`;
      const cLines = confessionText ? wrapText(ctx, confessionText, photoW) : [];
      const vSteps: [number, number][] = [
        [54, 65],
        [46, 55],
        [40, 48],
      ];
      let vSize = 40;
      let vLH = 48;
      let vLines: string[] = [];
      let photoH = photoPrefH;
      for (const [s, lh] of vSteps) {
        ctx.font = `700 ${s}px 'Control Upright', sans-serif`;
        const vl = wrapText(ctx, verdictResponse, photoW);
        const bandNeeded =
          bandGapTop +
          (cLines.length > 0 ? cLines.length * confLH + confToVerdict : 0) +
          vl.length * lh +
          footerGap +
          venueSize;
        const fitH = bandBottom - photoTop - bandNeeded;
        vSize = s;
        vLH = lh;
        vLines = vl;
        if (fitH >= photoPrefH) {
          photoH = Math.min(photoMaxH, fitH);
          break;
        }
        // Even the smallest verdict can't hold 70%: the photo yields to the
        // safe zone (chrome never covers the verdict), guarded at 55%.
        photoH = Math.max(Math.min(photoMaxH, fitH), photoGuardH);
      }
      const photoBottom = photoTop + photoH;

      // The crop step bakes the photo at 968×1459 (the full 76% frame). When
      // long text shrinks the print, take a centred slice — ~4% off top and
      // bottom at 70%, up to ~7% in the long-verdict extreme (~65%).
      const srcY = Math.max(0, Math.round((photo.height - photoH) / 2));
      ctx.drawImage(
        photo,
        0,
        srcY,
        photoW,
        Math.min(photoH, photo.height),
        inset,
        photoTop,
        photoW,
        photoH,
      );

      // ── Stamp ON the print: the WORDMARK ALONE, pinned to the photo's top
      // (top edge photo+44) — a stamp sits where it was struck, and the room
      // reads underneath it. NOTHING ELSE goes on the photo: orange is the
      // one colour proven to hold on an unknown photo, and orange is taken
      // by the mark. Every alternative for the charge line failed on a pale
      // photo — State Blue washes out, grey has no separation, white with an
      // outline reads as a subtitle — so the mark carries the
      // stamped-onto-evidence idea alone, and anything that must be READABLE
      // lives on a surface we control (the venue line is in the band's
      // footer row below). 340px, down from 400: it was sized to anchor a
      // stack of three and now stands alone.
      const wm = await loadImage(guiltyWordmark);
      const stampW = 340;
      const wmRatio = wm.height && wm.width ? wm.height / wm.width : 335.5 / 1000;
      const stampH = stampW * wmRatio;
      const stampTopY = photoTop + 44;
      const cx = W / 2;

      // GUILTY ORANGE, the asset's own colour — one brand mark on every
      // surface (WHITE WAS TRIED AND REVERTED: no separation on a pale
      // photo, read as generic app chrome — don't repeat it). NO shadow any
      // more: that was a white-stamp legibility fix, and it measured near
      // invisible even then.
      ctx.save();
      ctx.translate(cx, stampTopY + stampH / 2);
      ctx.rotate((-10 * Math.PI) / 180);
      ctx.drawImage(wm, -stampW / 2, -stampH / 2, stampW, stampH);
      ctx.restore();

      // ── Band: type directly on the mount, sharing the photo's left edge.
      // Confession first, so the verdict answers a visible question — at
      // rgb(180,175,166), BRIGHTER than the screen's muted token on purpose:
      // at the token grey it weighed the same as the URL and read as
      // metadata, when it's the setup the verdict answers. It must stay
      // quieter than the verdict (#F4F0EA), never brighter.
      let by = photoBottom + bandGapTop;
      if (cLines.length > 0) {
        ctx.fillStyle = "rgb(180, 175, 166)";
        ctx.font = `300 ${confSize}px 'Söhne Mono', monospace`;
        let cy = by + Math.round(confSize * 0.8);
        for (const ln of cLines) {
          ctx.fillText(ln, inset, cy);
          cy += confLH;
        }
        by += cLines.length * confLH + confToVerdict;
      }
      ctx.fillStyle = "#F4F0EA";
      ctx.font = `700 ${vSize}px 'Control Upright', sans-serif`;
      let vy = by + Math.round(vSize * 0.8);
      for (const ln of vLines) {
        ctx.fillText(ln, inset, vy);
        vy += vLH;
      }
      // Footer row, one baseline: the venue line left (State Blue neon — the
      // charge line that came OFF the photo, see the stamp note), the
      // address right (grey, handle-tier alpha).
      const lastVBaseline = vy - vLH;
      const footerBaseline =
        lastVBaseline + Math.round(vSize * 0.2) + footerGap + Math.round(venueSize * 0.8);
      setLS("5px");
      ctx.font = `400 ${venueSize}px 'Söhne Mono', monospace`;
      drawNeonStamp(
        filedVenue ? `AT ${filedVenue}` : "LOCATION WITHHELD",
        inset,
        footerBaseline,
      );
      setLS("0px");
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `400 ${urlSize}px 'Söhne Mono', monospace`;
      ctx.fillText("theboothrecord.com", W - inset, footerBaseline);
      ctx.textAlign = "left";

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to render image"))),
          "image/png",
        );
      });
    }

    // Background
    ctx.fillStyle = "#171513";
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // Reuse the verdict screen's CSS tokens so the card matches (no hardcoded hex):
    // --ritual-green is what .text-ritual uses; --muted-foreground is the on-screen grey.
    const root = getComputedStyle(document.documentElement);
    const ritualGreen = `hsl(${root.getPropertyValue("--ritual-green").trim()})`;
    const mutedGrey = `hsl(${root.getPropertyValue("--muted-foreground").trim()})`;

    // Label — same green as the screen's "The booth noticed."
    setLS("6px");
    ctx.fillStyle = ritualGreen;
    ctx.font = "400 26px 'Söhne Mono', monospace";
    ctx.fillText("THE BOOTH NOTICED.", pad, 210);
    setLS("0px");

    // Confession — same grey as on screen, light weight (sits below the verdict).
    ctx.fillStyle = mutedGrey;
    ctx.font = "300 42px 'Söhne Mono', monospace";
    const confession = sessionStorage.getItem("confession") || "";
    let y = 300;
    const cLH = 58;
    for (const ln of wrapText(ctx, confession, maxW)) {
      ctx.fillText(ln, pad, y);
      y += cLH;
    }

    // Verdict
    y += 80;
    ctx.fillStyle = "#F4F0EA";
    ctx.font = "700 70px 'Control Upright', sans-serif";
    const vLH = 84;
    for (const ln of wrapText(ctx, verdictResponse, maxW)) {
      ctx.fillText(ln, pad, y);
      y += vLH;
    }

    // ── Lower composition: TWO GROUPS ──
    // Group 1 (centred): GUILTY wordmark + AS CHARGED stamp, centred in the space below
    //   the verdict so the larger wordmark breathes.
    // Group 2 (footer, pinned to the bottom): SUBJECT # + @theboothrecord +
    //   theboothrecord.com.
    const img = await loadImage(guiltyWordmark);
    const stampW = 560;
    const ratio = img.height && img.width ? img.height / img.width : 335.5 / 1000;
    const stampH = stampW * ratio;

    const gapStampToCharge = 64;
    const chargeLH = 44;
    const groupH = stampH + gapStampToCharge + chargeLH; // wordmark + AS CHARGED (2 lines)

    // Centre group 1 between the verdict and the pinned footer. The group's
    // BOTTOM is clamped to regionBottom: when long text shrinks the region
    // below groupH, overflow spills UPWARD into the verdict gap, never
    // downward into the footer — if something has to give, it should be
    // whitespace between two readable things, not two lines of text printing
    // over each other. A cramped card is legible; an overlapping one isn't.
    // (Without the clamp, a 140-char confession + a ~140-char verdict printed
    // LOCATION WITHHELD through SUBJECT #.)
    const regionTop = y + 70;
    const regionBottom = H - 420; // leave room for the bottom-pinned footer (3 lines)
    const stampTopY = Math.min(
      regionTop + Math.max(0, (regionBottom - regionTop - groupH) / 2),
      regionBottom - groupH
    );

    const cx = W / 2;
    const cy = stampTopY + stampH / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-10 * Math.PI) / 180);
    ctx.drawImage(img, -stampW / 2, -stampH / 2, stampW, stampH);
    ctx.restore();

    ctx.textAlign = "center";

    // AS CHARGED — two lines, directly under the wordmark (group 1).
    //   line 1: "AS CHARGED" · line 2: "AT <VENUE>" or "LOCATION WITHHELD".
    // State Blue NEON on BOTH lines — one stamp, one treatment (two colours
    // would read as a bug). The OG card (card.mjs) carries the same core and
    // curve via CSS text-shadow; canvas has ONE shadow per draw, so the
    // three-layer curve is approximated with three shadow passes and a final
    // crisp core draw (drawNeonStamp above — the glow passes fill with the
    // CORE colour so only the halos accumulate, rather than the off-canvas
    // shadow-offset trick, which some renderers cull).
    const chargeLine1 = "AS CHARGED";
    const chargeLine2 = filedVenue ? `AT ${filedVenue}` : "LOCATION WITHHELD";
    const charge1Y = stampTopY + stampH + gapStampToCharge;
    setLS("6px");
    ctx.font = "400 30px 'Söhne Mono', monospace";
    drawNeonStamp(chargeLine1, cx, charge1Y);
    drawNeonStamp(chargeLine2, cx, charge1Y + chargeLH);
    setLS("0px");

    // Group 2 — footer pinned to the bottom: SUBJECT # then @theboothrecord
    // then theboothrecord.com. The footer sits ABOVE Instagram's bottom safe
    // zone — Meta reserves the bottom 250px of a 1080×1920 story (from y=1670)
    // for the reply box / send / swipe UI, and the handle and address are the
    // only things telling a viewer where the card came from. Lowest ink lands
    // at ~1649 (address baseline H - 270), 20px above the band. This is a
    // DELIBERATE geometry difference from the OG card, which is a link
    // preview with no safe zone — the pair-note's "aligned" means content and
    // treatment, not position. Do not push this footer back down.
    if (subjectNumber) {
      setLS("4px");
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.font = "400 24px 'Söhne Mono', monospace";
      ctx.fillText(`SUBJECT #${subjectNumber}`, cx, H - 370);
      setLS("0px");
    }

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "400 28px 'Söhne Mono', monospace";
    ctx.fillText("@theboothrecord", cx, H - 310);

    // theboothrecord.com — one step dimmer than the handle (the SUBJECT #
    // alpha), the OG card's treatment. Handle and URL are near-repetition on
    // purpose: the handle goes to Instagram, the URL goes to the Booth.
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText("theboothrecord.com", cx, H - 270);
    ctx.textAlign = "left";

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to render image"))),
        "image/png"
      );
    });
  };

  // PRIMARY share: resolve this confession's uuid (owner-gated) and share the single
  // /v/{uuid} link. The link's server-rendered preview carries the verdict + card image —
  // no separate text or attached file. Keep the PNG path (below) as the secondary option.
  const handleShareLink = async () => {
    // Reveal the Instagram follow line on tap (see hasShared note).
    setHasShared(true);
    // Share-INTENT metric (fire-and-forget), keyed on the persisted row source.
    // logShare keeps share_events as the unbroken historical series; the
    // booth_events share_link row alongside it records WHICH share this was —
    // the tappable /v/ link, as opposed to the dead-end card.
    logShare(rowSource);
    logBoothEvent("share_link", rowSource);
    setSharingLink(true);
    try {
      const id = shareId ?? (await resolveShareId(Number(subjectNumber), verdictResponse));
      if (!id) {
        toast({
          title: "Couldn't create the link",
          description: "Give it a second and try again.",
          variant: "destructive",
        });
        return;
      }
      if (!shareId) setShareId(id);
      const url = `https://theboothrecord.com/v/${id}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "GUILTY",
          text: url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Paste it anywhere." });
      }
    } catch {
      // User dismissed the native share sheet — no-op.
    } finally {
      setSharingLink(false);
    }
  };

  // SECONDARY "Save image": the client-rendered PNG, for Stories (which don't unfurl links).
  // POST TO STORY now opens the PHOTO STEP first (see the story state note);
  // the pieces of the old single-tap handler live on below: resolveCardContext
  // (uuid + stamp gating + venue), generateShareCard, and shareStoryBlob (the
  // share sheet / download). Skip runs them back-to-back — exactly the old
  // handler — so skipping produces the card that existed before this feature.
  const handlePostToStory = () => setStory({ step: "choose" });

  // Resolve our own uuid (owner-gated) ONCE. It does two jobs: stamp_venue for the
  // card, and the /v/{uuid} link that travels with the PNG.
  const resolveCardContext = async (): Promise<{ uuid: string | null; filedVenue: string }> => {
    let uuid = shareId;
    if (!uuid && subjectNumber && verdictResponse) {
      uuid = await resolveShareId(Number(subjectNumber), verdictResponse);
      if (uuid) setShareId(uuid);
    }
    // stamp_venue is seeded from the Edge Function response (stored by Receiving), so the
    // card is drawn ONCE with the correct venue and never swaps. This fetch is now only a
    // FALLBACK for a function build that omits the field; it can only ever UNLOCK stamping,
    // never re-suppress. FAIL CLOSED: on any failure suppress stays TRUE → venue withheld.
    let suppress = !mayStampVenue(stampVenue);
    if (stampVenue === undefined && uuid) {
      const row = await fetchSharedVerdict(uuid);
      if (row) {
        setStampVenue(row.stamp_venue);
        suppress = !mayStampVenue(row.stamp_venue);
      }
    }
    return { uuid, filedVenue: await computeFiledVenue(suppress) };
  };

  // The actual handoff to the share sheet (or the desktop download fallback).
  // Share-INTENT metrics moved here from the POST TO STORY tap: with the photo
  // step in between, the tap only opens a chooser — the honest intent moment
  // is when the sheet opens. logShare keeps the historical series; share_card
  // alongside it records this was the PNG card (not tappable), splitting
  // reach-with-a-path from reach without.
  const shareStoryBlob = async (blob: Blob, uuid: string | null) => {
    // Reveal the Instagram follow line on tap (SAVE IMAGE gives no completion callback).
    setHasShared(true);
    logShare(rowSource);
    logBoothEvent("share_card", rowSource);
    const file = new File([blob], "guilty-on-record.png", { type: "image/png" });

    const canShareFiles =
      typeof navigator !== "undefined" &&
      !!navigator.canShare &&
      navigator.canShare({ files: [file] });

    // The url travels WITH the image. It MUST be /v/{uuid}, not the homepage:
    //   1. VerdictShare's CTA is `/confess?source=<venue>` — so a confession referred by
    //      a shared Story is CREDITED TO THE VENUE. A homepage link lands as `direct`,
    //      silently leaking the venue's own UGC referrals out of its own numbers.
    //   2. The recipient lands on the exact verdict they just saw, not a cold front door.
    // Homepage only as a fallback if the uuid can't be resolved.
    const shareUrl = uuid ? `https://theboothrecord.com/v/${uuid}` : "https://theboothrecord.com";

    if (canShareFiles) {
      await navigator.share({ files: [file], title: "GUILTY", text: shareUrl });
    } else {
      // Desktop fallback: download the PNG.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "guilty-on-record.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  // Close the photo flow and release every object URL it holds. The photo
  // lives ONLY behind these URLs and the in-memory canvases — nothing is
  // uploaded, stored, or sent anywhere, so closing the flow is the end of it.
  const closeStory = () => {
    if (storyPhotoUrl.current) {
      URL.revokeObjectURL(storyPhotoUrl.current);
      storyPhotoUrl.current = null;
    }
    setStory((s) => {
      if (s?.step === "preview") URL.revokeObjectURL(s.url);
      return null;
    });
  };

  // skip → the old single-tap path, unchanged card, then out.
  const skipPhoto = async () => {
    setSharing(true);
    try {
      const { uuid, filedVenue } = await resolveCardContext();
      const blob = await generateShareCard(filedVenue);
      await shareStoryBlob(blob, uuid);
    } catch {
      // User cancelled the share sheet, or generation failed.
    } finally {
      setSharing(false);
      closeStory();
    }
  };

  // A photo was picked (camera or library input) — decode it and move to crop.
  const onStoryFile = async (f: File | null | undefined) => {
    if (!f) return;
    try {
      const url = URL.createObjectURL(f);
      const img = new Image();
      // onload/onerror rather than img.decode(): decode() can stall on
      // detached images in some engines. Listeners attach BEFORE src so a
      // cached load can't slip past them.
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("unreadable image"));
        img.src = url;
      });
      if (storyPhotoUrl.current) URL.revokeObjectURL(storyPhotoUrl.current);
      storyPhotoUrl.current = url;
      setStory({ step: "crop", img });
    } catch {
      toast({
        title: "Couldn't read that photo",
        description: "Try another one.",
        variant: "destructive",
      });
    }
  };

  // Crop confirmed → render the full card once and show it (RETAKE replaces
  // any framing guide: they judge the result rather than imagining it).
  const onCropDone = async (photoCanvas: HTMLCanvasElement) => {
    setSharing(true);
    try {
      const { uuid, filedVenue } = await resolveCardContext();
      storyUuid.current = uuid;
      const blob = await generateShareCard(filedVenue, photoCanvas);
      setStory((s) => {
        if (s?.step === "preview") URL.revokeObjectURL(s.url);
        return { step: "preview", blob, url: URL.createObjectURL(blob) };
      });
    } catch {
      toast({
        title: "Couldn't build the card",
        description: "Give it a second and try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const shareStoryPreview = async (blob: Blob) => {
    setSharing(true);
    try {
      await shareStoryBlob(blob, storyUuid.current);
    } catch {
      // User cancelled the share sheet — stay on the preview so they can retry.
      return;
    } finally {
      setSharing(false);
    }
    closeStory();
  };

  // Action-area type rule: 13px is the FUNCTIONAL tier — anything you can press
  // (SHARE VERDICT, SEE THE RECORD, and this underlined pair). 11px is the LABEL
  // tier — anything you read ("Your words. Not your name.", FIRST OFFENCE).
  // shareSecondary is the underlined text-link treatment shared by POST TO STORY
  // and (post-share) SHARE AGAIN.
  const shareSecondary =
    "text-[13px] text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide";
  // SEE THE RECORD pre-share — quiet exit, one step above the 11px action scale
  // but still muted and boxless so it never competes with the share action
  // (sharing is the perishable one). Post-share it's promoted to the boxed
  // primary instead, at the same 13px.
  const wallLink =
    "text-[13px] text-muted-foreground hover:text-foreground transition-colors tracking-wide";

  return (
    <div className="screen-container animate-fade-in">
      <div className="flex-1 flex flex-col justify-center items-start text-left pb-10">
        {/* System stamp, not a headline — smallest text on the screen. 12px below,
            matching the share page: stamp + confession read as one block. */}
        <p className="text-ritual text-[11px] font-mono-light tracking-[0.2em] mb-3 min-h-[1em] relative">
          <span className="relative inline-block">
            {typedText}
            {showCursor && <span className="animate-pulse">|</span>}
            {/* Glitch slice overlays */}
            {isGlitching && typedText && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset}px)`,
                    clipPath: `inset(${glitchTop}% 0 ${100 - glitchTop - 20}% 0)`,
                    textShadow: '2px 0 #ff0000, -2px 0 #00ffff',
                  }}
                >
                  {typedText}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute left-0 text-ritual"
                  style={{
                    top: 0,
                    transform: `translateX(${glitchOffset2}px)`,
                    clipPath: `inset(${glitchTop2}% 0 ${100 - glitchTop2 - 15}% 0)`,
                    textShadow: '-2px 0 #ff0000, 2px 0 #00ffff',
                  }}
                >
                  {typedText}
                </span>
              </>
            )}
          </span>
        </p>

        {/* 32px below the confession — matching the share page, and deliberately
            the WIDEST break in the block: the gap between what a person typed and
            what the machine said. */}
        {confession && (
          <p className="text-muted-foreground text-base md:text-lg font-mono-light leading-relaxed tracking-wide mb-8 max-w-[600px] whitespace-pre-line">
            {confession}
          </p>
        )}

        <div className="font-control text-3xl md:text-4xl font-bold text-foreground mb-6 whitespace-pre-line">
          {verdictResponse}
        </div>
      </div>

      {/* NO divider rule above this block — REMOVED, deliberately, from all three
          static verdict screens (both states here + VerdictShare found). This
          page doesn't scroll: three signals already separate the record from
          the actions — the large gap, the switch from Control to mono, and
          the change from left-aligned record to centred actions — and a
          fourth saying the same thing was furniture. The wall's rule STAYS:
          there it marks where a scrolling feed meets a pinned bar, a real
          boundary — don't remove that one for consistency. The pt-6 is kept:
          it was always the breathing room; the rule only underlined it. */}
      <div className="shrink-0 w-full pt-6 flex flex-col items-center gap-6">
        {/* Feature 2 — email capture (currently gated OFF via ENABLE_EMAIL_CAPTURE) */}
        {ENABLE_EMAIL_CAPTURE &&
          (claimState === "claimed" ? (
            <p className="text-ritual text-sm font-mono-light tracking-wide text-center max-w-xs">
              Your case is on file. The booth knows where to find you.
            </p>
          ) : claimState !== "skipped" ? (
            <div className="w-full max-w-xs flex flex-col items-center gap-3">
              <p className="text-muted-foreground text-xs font-mono-light tracking-wide text-center">
                Claim your case. Leave a way to be reached.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleClaim();
                }}
                placeholder="your@email.com"
                className="w-full bg-transparent border-b border-border/40 text-center text-ritual text-base font-mono-light tracking-wide py-1 outline-none focus:border-ritual/60 transition-colors"
              />
              <div className="flex items-center gap-6">
                <button
                  onClick={handleClaim}
                  disabled={claimState === "saving"}
                  className="text-sm text-foreground underline underline-offset-4 hover:text-ritual transition-colors tracking-wide disabled:opacity-50"
                >
                  {claimState === "saving" ? "FILING…" : "CLAIM YOUR CASE"}
                </button>
                <button
                  onClick={handleSkipEmail}
                  className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors tracking-wide"
                >
                  NOT NOW
                </button>
              </div>
            </div>
          ) : null)}

        {!hasShared ? (
          /* Pre-share: promise line + SHARE VERDICT (boxed, the perishable action) with
             POST TO STORY beneath. The disclosure line IS the consent. */
          <div className="w-full max-w-xs flex flex-col items-center gap-3">
            {/* Grey caption, NOT green: green marks live and machine things (the
                listening dot, the stamp, the placeholder, primary actions) — a
                caption is neither. Same slot and job as "Reoffend." post-share. */}
            <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
              Your words. Not your name.
            </p>
            {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
                hairline (muted-foreground/40, the divider's own rule),
                transparent — the glow is the only colour in the box. */}
            <button
              onClick={handleShareLink}
              disabled={sharingLink}
              className="btn-booth border border-muted-foreground/40 bg-transparent text-[13px] hover:bg-transparent disabled:opacity-50"
            >
              <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                {sharingLink ? "FILING…" : "SHARE VERDICT"}
              </span>
            </button>
            <div className="flex items-center gap-6">
              <button onClick={handlePostToStory} disabled={sharing} className={shareSecondary}>
                {sharing ? "PREPARING…" : "POST TO STORY"}
              </button>
              <button onClick={handleConfessAgain} className={shareSecondary}>
                CONFESS AGAIN
              </button>
            </div>
          </div>
        ) : (
          /* Post-share: CONFESS AGAIN is the boxed primary — the sharing job is
             done, so the box holds the next confession. The share actions drop
             to an equal-weight text-link row (still fully working for repeat
             shares); SEE THE RECORD closes the screen as a quiet link.
             Pre-share hierarchy is deliberately unchanged: SHARE VERDICT keeps
             the box there — sharing is the growth loop.
             THE PURCHASE BLOCK IS GONE — DELIBERATE: "Reoffend." and THE FIRST
             OFFENCE — $55 were removed here, and this was the LAST purchase
             link in the app. There is now no route from the Booth to the shop
             on any screen. (offence_events and log_offence_tap stay in the
             database; nothing writes to them any more.) */
          <div className="w-full max-w-xs flex flex-col items-center gap-5">
            {/* Caption marks the STATE, not the action: pre- and post-share now
                differ only by which action sits in the box, and an empty
                caption slot made the flip easy to miss (the orange buy box
                used to make it unmissable). KNOWN LIMITATION, accepted:
                hasShared flips when SHARE VERDICT is TAPPED, not when the
                share completes — the share sheet doesn't reliably report
                completion — so someone who taps then cancels sees a line
                asserting something that didn't happen. The alternative is no
                confirmation at all. Do NOT write copy that leans harder on
                the claim. */}
            <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
              It's out there now.
            </p>
            {/* THE PRIMARY-ACTION RULE (see index.css): glowing label, 1px grey
                hairline, transparent. The caption above frames the STATE (see
                its note), not this action — CONFESS AGAIN still says what it
                does. Same handler and confess_again logging as the old link. */}
            <button
              onClick={handleConfessAgain}
              className="btn-booth border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
            >
              <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                CONFESS AGAIN
              </span>
            </button>
            {/* Link row: POST TO STORY · SHARE VERDICT — with CONFESS AGAIN
                promoted to the box, SHARE VERDICT drops to the row on the same
                handler the pre-share box uses (repeat shares keep working). */}
            <div className="flex items-center gap-6">
              <button onClick={handlePostToStory} disabled={sharing} className={shareSecondary}>
                {sharing ? "PREPARING…" : "POST TO STORY"}
              </button>
              <button onClick={handleShareLink} disabled={sharingLink} className={shareSecondary}>
                {sharingLink ? "FILING…" : "SHARE VERDICT"}
              </button>
            </div>
            {verdictResponse !== "Entry withheld" && (
              <button onClick={() => handleNavigate("/thewall")} className={wallLink}>
                SEE THE RECORD →
              </button>
            )}
          </div>
        )}

        {/* Pre-share only: the quiet wall exit. One tier up from a footer, never
            competing with SHARE VERDICT — sharing is the PERISHABLE action; once they
            leave for the wall, Confess.tsx's mount reset wipes the card and it can
            never be shared. Post-share the wall is the boxed primary above instead. */}
        {!hasShared && verdictResponse !== "Entry withheld" && (
          <div className="mt-10 flex flex-col items-center">
            <button onClick={() => handleNavigate("/thewall")} className={wallLink}>
              SEE THE RECORD →
            </button>
          </div>
        )}
      </div>

      {/* ── POST TO STORY photo flow (see the story state note). Full-screen
          overlay: choose → crop → preview. skip at the bottom of choose runs
          the old single-tap path — today's card, byte for byte. */}
      {story ? (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center px-6 pt-10 pb-8 overflow-hidden animate-fade-in">
          {story.step === "choose" ? (
            <>
              <div className="flex-1 w-full max-w-xs flex flex-col items-center justify-center gap-5">
                {/* Framing caption (THE PRIMARY-ACTION RULE): what the photo is
                    FOR — the room the venue is sold on, not the plate. */}
                <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
                  THE ROOM, NOT YOUR DINNER
                </p>
                {/* capture="environment" opens the back camera directly; the
                    library lives behind the quiet link below (its input has no
                    capture attribute). */}
                <label className="btn-booth block w-full border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent cursor-pointer">
                  <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                    TAKE A PHOTO
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onStoryFile(e.target.files?.[0])}
                  />
                </label>
                <label className={`${shareSecondary} cursor-pointer`}>
                  or pick one
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onStoryFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <button onClick={skipPhoto} disabled={sharing} className={shareSecondary}>
                skip
              </button>
            </>
          ) : story.step === "crop" ? (
            <StoryPhotoCrop
              img={story.img}
              busy={sharing}
              onUse={onCropDone}
              onBack={() => setStory({ step: "choose" })}
            />
          ) : (
            <>
              {/* The finished card IS the framing guide — they judge the
                  result, not a description of it. */}
              <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-5">
                <img
                  src={story.url}
                  alt="Your story card"
                  className="border border-muted-foreground/40"
                  style={{ width: "min(75vw, 34vh)", aspectRatio: "9 / 16" }}
                />
                <button
                  onClick={() => shareStoryPreview(story.blob)}
                  disabled={sharing}
                  className="btn-booth block w-full max-w-xs border border-muted-foreground/40 bg-transparent text-sm text-center hover:bg-transparent"
                >
                  <span className="enter-glow-text text-[hsl(var(--ritual-green))]">
                    {sharing ? "OPENING…" : "POST TO STORY"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setStory((s) => {
                      if (s?.step === "preview") URL.revokeObjectURL(s.url);
                      return { step: "choose" };
                    });
                  }}
                  disabled={sharing}
                  className={shareSecondary}
                >
                  RETAKE
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default Verdict;
