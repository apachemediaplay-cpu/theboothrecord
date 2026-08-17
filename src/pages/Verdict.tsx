import { useNavigate } from "react-router-dom";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useKioskTimeout, KioskIdleLine, KioskStaffReset } from "@/hooks/useKioskTimeout";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import guiltyWordmark from "@/assets/Guilty_Wordmark_RGB_Orange.svg";
import {
  resolveVenueDisplayName,
  mayStampVenue,
  isKioskSession,
  isPhysicalScan,
  kioskHandoffUrl,
} from "@/lib/source";
import { beginShareResolve, endShareResolve } from "@/lib/reset";
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

// ── FILM GRADE for the story card's photo — strength in ONE place. ──────────
// 0 = off, 1 = heavy; 0.5 is the shipped medium. FIXED, never adaptive and
// never per-photo: a fixed value is what makes cards from one venue read as
// a set, which matters more than optimising any single photo.
const FILM_GRADE = 0.5;

// Grade the baked photo and return a new canvas. Applied ONLY to the photo
// pixels, BEFORE they are drawn into the card — never to the whole canvas:
// grading the card would shift the #171513 mount blue and warm the orange
// wordmark, breaking the match with the no-photo card and the app's tokens.
// The moves, in order: split tone (shadows lifted toward cool blue-grey,
// highlights pushed toward amber — Frenchie and Gigi already look like this,
// so the grade amplifies the room rather than inventing a look), slight
// contrast soften, slight desaturation, fine grain to break the digital
// cleanliness, and a soft bloom on the brightest points.
// EXPECTED BEHAVIOUR: strong on dark warm rooms (the venues), nearly
// invisible on bright daytime photos (most Direct traffic) — split-toning
// needs shadows to work on. That asymmetry is correct, not a bug.
const gradePhoto = (src: HTMLCanvasElement): HTMLCanvasElement => {
  const w = src.width;
  const h = src.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const g = out.getContext("2d");
  if (!g) return src;
  g.drawImage(src, 0, 0);
  const S = FILM_GRADE;
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  const contrast = 1 - 0.12 * S; // soften around mid-grey
  const desat = 0.18 * S;
  const grain = 16 * S;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let gg = d[i + 1];
    let b = d[i + 2];
    const t = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    // Split tone: weight the tints by squared distance from mid so mids stay
    // honest — shadows go cool blue-grey, highlights go amber.
    const sw = (1 - t) * (1 - t);
    const hw = t * t;
    r += S * (sw * -14 + hw * 16);
    gg += S * (sw * 2 + hw * 7);
    b += S * (sw * 18 + hw * -14);
    r = 128 + (r - 128) * contrast;
    gg = 128 + (gg - 128) * contrast;
    b = 128 + (b - 128) * contrast;
    const l = 0.299 * r + 0.587 * gg + 0.114 * b;
    r += (l - r) * desat;
    gg += (l - gg) * desat;
    b += (l - b) * desat;
    // Fine monochrome grain (same offset on all channels = luma noise).
    const n = (Math.random() - 0.5) * grain;
    r += n;
    gg += n;
    b += n;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  g.putImageData(id, 0, 0);
  // Bloom: pull the brightest points into their own layer, blur them by
  // round-tripping through a 1/10-scale canvas (works everywhere — no
  // ctx.filter dependency), and screen the result back over the photo.
  const hi = document.createElement("canvas");
  hi.width = w;
  hi.height = h;
  const hictx = hi.getContext("2d");
  if (hictx) {
    const hid = hictx.createImageData(w, h);
    const hd = hid.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const m = l > 208 ? (l - 208) / 47 : 0; // only the brightest points
      hd[i] = d[i] * m;
      hd[i + 1] = d[i + 1] * m;
      hd[i + 2] = d[i + 2] * m;
      hd[i + 3] = 255;
    }
    hictx.putImageData(hid, 0, 0);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / 10));
    small.height = Math.max(1, Math.round(h / 10));
    const sctx = small.getContext("2d");
    if (sctx) {
      sctx.drawImage(hi, 0, 0, small.width, small.height);
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.4 * S;
      g.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
      g.restore();
    }
  }
  return out;
};

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

  // ── KIOSK. Read once at mount; every kiosk branch below gates on this and
  // nothing else, so a phone's Verdict screen is untouched.
  const [kiosk] = useState(() => isKioskSession());
  // The handoff QR: resolving → resolved → failed. On the booth the uuid is
  // resolved ON MOUNT rather than on tap, because there is no tap — the QR IS
  // the action, and it has to be on screen by the time they look up.
  const [qr, setQr] = useState<
    { state: "resolving" } | { state: "ready"; dataUrl: string } | { state: "failed" }
  >({ state: "resolving" });
  // Idle reset: 90s here against /confess's 60. Longer than the writing screen
  // on purpose — this is where someone reads the verdict, decides whether they
  // like it, gets their phone out and lines up the QR. 40s cut people off
  // mid-scan; the screen is only "abandoned" once it has sat far past that.
  const idleLeft = useKioskTimeout(90, "verdict");

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

  // ── KIOSK QR: resolve on mount, draw once. Reuses resolveShareId — the SAME
  // owner-gated resolver both share paths use; there is deliberately no second
  // resolver, because a second one would be a second definition of who owns a
  // confession. The window is marked so an idle reset can't rotate the session
  // id mid-lookup (see lib/reset).
  useEffect(() => {
    if (!kiosk) return;
    if (!subjectNumber || !verdictResponse || verdictResponse === "Entry withheld") {
      setQr({ state: "failed" });
      return;
    }
    let cancelled = false;
    beginShareResolve();
    (async () => {
      try {
        const id = shareId ?? (await resolveShareId(Number(subjectNumber), verdictResponse));
        if (cancelled) return;
        if (!id) {
          setQr({ state: "failed" });
          return;
        }
        if (!shareId) setShareId(id);
        // ?k= carries the offer key VerdictShare looks up, and tags the scan as
        // a kiosk handoff. One definition, shared with the round strip's QRs.
        const url = kioskHandoffUrl(id);
        // BLACK ON WHITE, not the booth's green on its own background. The
        // green version was palette-first and it cost scans: a phone camera in
        // a dark room is working at the edge of its exposure, and maximum
        // contrast is the only thing that makes the first attempt land. The
        // white field IS the card — margin is in MODULES, and 3 lands the
        // quiet zone at ~7% of the image on every side, which is what lets a
        // scanner find the finder patterns against a dark screen. (The ISO
        // recommendation is 4 modules, ~9%; 3 is the briefed 7%.)
        //
        // sRGB, EXPLICITLY: the canvas colour space is set before qrcode takes
        // its own context, so the exported PNG is tagged. An untagged data URL
        // is interpreted as Display P3 on iPhone — which is why the old green
        // read yellow on the booth's own hardware. Black and white are
        // colour-space-proof anyway; the tag keeps it that way if the palette
        // ever comes back.
        const qrCanvas = document.createElement("canvas");
        qrCanvas.getContext("2d", { colorSpace: "srgb" });
        await QRCode.toCanvas(qrCanvas, url, {
          width: 640, // rendered at 2x the on-screen cap — crisp on the tablet
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        const dataUrl = qrCanvas.toDataURL("image/png");
        if (cancelled) return;
        setQr({ state: "ready", dataUrl });
        // Fired on RENDER, not on resolve: a QR nobody could see was never a
        // handoff.
        logBoothEvent("kiosk_qr", rowSource);
      } catch {
        if (!cancelled) setQr({ state: "failed" });
      } finally {
        endShareResolve();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the verdict for this session never changes under the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk]);

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

    // Layered neon glow — ONE structure, per-colour variants below (not
    // special cases: any future element picks a colourway). Three shadow
    // passes at the app's curve (2.8/10/26 @ .97/.68/.47) filled with the
    // CORE colour so only the halos accumulate, then a crisp core draw.
    // The core must stay brighter than the halo or it reads as blur.
    const drawNeonText = (
      text: string,
      x: number,
      y: number,
      core: string,
      halo: [string, string, string],
    ) => {
      const layers: [number, string][] = [
        [2.8, halo[0]],
        [10, halo[1]],
        [26, halo[2]],
      ];
      ctx.fillStyle = core;
      for (const [blur, color] of layers) {
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.fillText(text, x, y);
      }
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillText(text, x, y);
    };
    // State Blue — the filing voice (both compositions' stamps, the header).
    const drawNeonStamp = (text: string, x: number, y: number) =>
      drawNeonText(text, x, y, "rgb(120,205,235)", [
        "rgba(52,155,189,0.97)",
        "rgba(52,155,189,0.68)",
        "rgba(52,155,189,0.47)",
      ]);
    // Ritual green — the ask (the card's CTA). Halo is the token green
    // (rgb(0,255,30), card.mjs's RITUAL); core lightened one step, mirroring
    // how the blue core sits above State Blue.
    const drawNeonGreen = (text: string, x: number, y: number) =>
      drawNeonText(text, x, y, "rgb(140,255,150)", [
        "rgba(0,255,30,0.97)",
        "rgba(0,255,30,0.68)",
        "rgba(0,255,30,0.47)",
      ]);

    if (photo) {
      // ── PHOTO COMPOSITION: THE MINIMAL CARD ──────────────────────────
      // Header (filing time left, venue chip right) → print → verdict →
      // URL footer. Assembled from three successive briefs; the confession
      // and the band venue line are GONE by that design — the venue lives
      // in the header chip, and the verdict stands alone as the record.
      // (This supersedes the earlier recorded positions: "the venue moved
      // into the band to sit with the verdict" and "the verdict needs its
      // question visible" — both were re-decided by the minimal-card briefs.)
      // The time is the CONFESSION'S OWN timestamp (specced): filedAt from
      // Receiving, HH:MM 24h — see the header block below.
      // DERIVED, NOT SPECCED — verify and correct: time/chip type sizes
      // (26/24 mono), flat State Blue for the whole header (filing-mark
      // voice, matching the wall stamps' flat convention), chip vertical
      // padding (14), and the top margin value (81, from the brief's own
      // artifact).
      ctx.fillStyle = "#171513";
      ctx.fillRect(0, 0, W, H);

      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";

      // Real ink extents for a rendered string — the actual bounding box,
      // not em fractions. ALL vertical gaps on this card are measured ink:
      // descender of one element to cap-height of the next.
      const inkOf = (font: string, text: string) => {
        ctx.font = font;
        const m = ctx.measureText(text);
        return {
          asc: Math.round(m.actualBoundingBoxAscent),
          desc: Math.round(m.actualBoundingBoxDescent),
        };
      };

      // THE STACK: meta bar → print → verdict → URL, all ink-measured.
      //   meta ink bottom → print top   24
      //   print bottom    → verdict cap 48  (image to text)
      //   verdict ink     → URL cap     32  (the verdict and its footer)
      //
      // MARGINS ARE CHROME RESERVES, MEASURED — not taste. On a published
      // Story viewed AS A VIEWER (13 Aug 2026, single handset), Instagram
      // covers card y 0–165 (top) and y 1809–1920 (bottom). Everything the
      // card says must live between those lines.
      // marginTop 172 is the META'S INK TOP (not the print's): it clears
      // the 165 top reserve with 7px to spare. The meta sits on the card
      // background above the print — ON BLACK, never on the photo, where
      // its legibility would depend on what was shot.
      // marginBottom 170 puts the last ink near 1750 — ~59px clear of the
      // bottom reserve. THAT 59px IS DELIBERATE TOLERANCE for handsets with
      // a taller home indicator: do not spend it to grow the print without
      // re-measuring on a second device.
      const inset = 56;
      const marginTop = 172; // meta INK TOP (top reserve is 165)
      const metaToPrint = 24; // meta ink bottom → print top
      const marginBottom = 170; // URL ink bottom → card bottom (reserve 111)
      const printToVerdict = 48;
      const verdictToUrl = 32;
      const photoW = W - inset * 2; // 968
      const photoPrefH = Math.round(H * 0.65); // step the verdict below this
      const photoGuardH = Math.round(H * 0.55); // absolute floor

      // ── THE META BAR: time left, venue right, on the card background
      // above the print. Not a header block, not a chip, not a rule — two
      // facts on one line at the frame's own margins, so the bar IS the
      // alignment. Fixed 26px with NO step-down: at this size the two
      // strings sit ~600px apart on a 1080 row, so nothing can collide and
      // nothing needs to shrink.
      // It sits on black rather than on the photo because on-print type
      // failed twice for the same reason — its legibility depended on
      // whatever was photographed.
      const metaFont = "400 26px 'Söhne Mono', monospace";
      // The FILING time, not card-generation time: the card is a record of
      // when the confession happened, and someone can share hours later —
      // render time would misdate the night. filedAt is captured by
      // Receiving at the moment the verdict lands, on the confessor's phone
      // at the venue, so device-local IS venue-local (no timezone column
      // exists on confessions or venues, and none is needed). The
      // render-time fallback only fires for a session predating this build.
      const filedAtRaw = Number(sessionStorage.getItem("filedAt"));
      const filedAt = Number.isFinite(filedAtRaw) && filedAtRaw > 0
        ? new Date(filedAtRaw)
        : new Date();
      const timeText = `${String(filedAt.getHours()).padStart(2, "0")}:${String(
        filedAt.getMinutes(),
      ).padStart(2, "0")}`;
      // The venue is ALWAYS cut at its first comma — "The StandardX,
      // Melbourne" → "THE STANDARDX". The city is the droppable half: the
      // room is what a viewer acts on, and the cut keeps the bar to two
      // short facts. Unconditional, not a width fallback. (LOCATION
      // WITHHELD has no comma and passes through whole.)
      const rawVenue = filedVenue || "LOCATION WITHHELD";
      const venueText = rawVenue.includes(",")
        ? rawVenue.slice(0, rawVenue.indexOf(",")).trim()
        : rawVenue;

      // Draw the bar: ink-positioned at both ends — the time's ink starts
      // at the inset, the venue's ink ends on the print's right edge, and
      // the row's ink top is marginTop. Baseline/extents come from the
      // taller of the two strings so the row reads as one line.
      setLS("2px");
      ctx.font = metaFont;
      const timeM = ctx.measureText(timeText);
      const venueM = ctx.measureText(venueText);
      const metaAsc = Math.max(timeM.actualBoundingBoxAscent, venueM.actualBoundingBoxAscent);
      const metaDesc = Math.max(timeM.actualBoundingBoxDescent, venueM.actualBoundingBoxDescent);
      const metaBaseline = marginTop + metaAsc;
      const metaInkBottom = metaBaseline + metaDesc;
      drawNeonStamp(timeText, inset + timeM.actualBoundingBoxLeft, metaBaseline);
      drawNeonStamp(
        venueText,
        W - inset - venueM.actualBoundingBoxRight,
        metaBaseline,
      );
      setLS("0px");

      // ── Print size: the photo takes everything the fixed stack doesn't
      // need — no ceiling; the % is an OUTCOME (reported per render in dev).
      // The verdict steps down (42 → 38 → 34, leading 1.22) below a 65%
      // print; 55% guards absurd inputs. 42 as the top step, down from 54:
      // with the confession gone from the band the verdict is ALONE down
      // there, and 54 filled the space rather than sitting in it — 42 gives
      // the band negative space and the print grows into the difference.
      const photoTop = metaInkBottom + metaToPrint;
      // The CTA's OWN size — it inherited chipFont (24) in the minimal-card
      // rewrite and lost its constant; the URL is the only route back to the
      // site on an image nobody can tap, and it earns its own scale. Keep
      // this constant so it can't get absorbed a second time.
      const ctaSize = 28;
      const ctaFont = `400 ${ctaSize}px 'Söhne Mono', monospace`;
      const ctaInk = inkOf(ctaFont, "confess at theboothrecord.com");
      const vSteps: [number, number][] = [
        [40, 49],
        [36, 44],
        [32, 39],
      ];
      let vSize = 32;
      let vLH = 39;
      let vLines: string[] = [];
      let vTopInk = 0;
      let vBottomInk = 0;
      let photoH = photoPrefH;
      for (const [s, lh] of vSteps) {
        const vFont = `700 ${s}px 'Control Upright', sans-serif`;
        ctx.font = vFont;
        const vl = wrapText(ctx, verdictResponse, photoW);
        const vAsc = inkOf(vFont, vl[0] ?? "").asc;
        const vDesc = inkOf(vFont, vl[vl.length - 1] ?? "").desc;
        const below =
          printToVerdict +
          vAsc +
          (vl.length - 1) * lh +
          vDesc +
          verdictToUrl +
          ctaInk.asc +
          ctaInk.desc;
        const fitH = H - marginBottom - below - photoTop;
        vSize = s;
        vLH = lh;
        vLines = vl;
        vTopInk = vAsc;
        vBottomInk = vDesc;
        if (fitH >= photoPrefH) {
          photoH = fitH;
          break;
        }
        photoH = Math.max(fitH, photoGuardH);
      }
      const photoBottom = photoTop + photoH;

      // The crop step bakes the photo at 968×1520 — just above the tallest
      // print this layout produces (a one-line verdict lands ~1515 since the
      // 42px verdict step; only ~5px of headroom remains, so re-check this
      // if the band shrinks again). Cards take a centred slice down to the
      // actual print height; the slice is small on short cards and grows
      // with the verdict.
      // FILM GRADE applied here, to the photo pixels ONLY (see gradePhoto):
      // everything drawn after this — mount, wordmark, band type — stays in
      // the app's own colours.
      const graded = gradePhoto(photo);
      const srcY = Math.max(0, Math.round((graded.height - photoH) / 2));
      ctx.drawImage(
        graded,
        0,
        srcY,
        photoW,
        Math.min(photoH, graded.height),
        inset,
        photoTop,
        photoW,
        photoH,
      );

      // ── Stamp ON the print: the WORDMARK ALONE, bottom-right corner —
      // NOTHING else goes on the print. The charge line lived here briefly
      // (under the mark, neon) and left FOR GOOD: its legibility depended on
      // whatever was photographed, and pale rooms washed it out. On-print
      // type has now failed twice for that reason (white wordmark before
      // it); the print carries the orange mark and only the mark — the
      // venue reads from the header chip, on a surface we control.
      // KNOWN TRADE: the bottom of a photo is usually the foreground — the
      // crop step mitigates this, because the mark's position is fixed and
      // people frame knowing where it lands.
      // NOTE the -10° tilt swings the mark's lower-left corner below its
      // nominal box, but the SVG's ink is inset within that box and absorbs
      // most of it. The centre is nudged UP 7px off the pure box math so the
      // measured INK sits equidistant from the print's right and bottom
      // edges (~35px each) — position the ink, not the box.
      const wm = await loadImage(guiltyWordmark);
      const stampW = 340;
      const wmRatio = wm.height && wm.width ? wm.height / wm.width : 335.5 / 1000;
      const stampH = stampW * wmRatio;
      const stampCx = inset + photoW - 34 - stampW / 2;
      const stampCy = photoBottom - 34 - stampH / 2 - 7;

      // GUILTY ORANGE, the asset's own colour — one brand mark on every
      // surface (WHITE WAS TRIED AND REVERTED: no separation on a pale
      // photo, read as generic app chrome — don't repeat it). NO shadow any
      // more: that was a white-stamp legibility fix, and it measured near
      // invisible even then.
      ctx.save();
      ctx.translate(stampCx, stampCy);
      ctx.rotate((-10 * Math.PI) / 180);
      ctx.drawImage(wm, -stampW / 2, -stampH / 2, stampW, stampH);
      ctx.restore();

      // ── Below the print: verdict, then its footer. Baselines chained from
      // MEASURED INK: baseline = previous ink bottom + stated gap + this
      // element's measured cap ascent. The verdict stands alone — the
      // minimal card carries no confession and no band venue line (the
      // venue is the header chip).
      ctx.fillStyle = "#F4F0EA";
      ctx.font = `700 ${vSize}px 'Control Upright', sans-serif`;
      let vy = photoBottom + printToVerdict + vTopInk;
      for (const ln of vLines) {
        ctx.fillText(ln, inset, vy);
        vy += vLH;
      }
      const vInkBottom = vy - vLH + vBottomInk;
      // ── FOOTER: the URL alone, flush left at the inset. The filing
      // meta moved to the top bar, so there is no second element on this
      // line and no collision rule — the cascade that used to shrink,
      // de-time and truncate the meta here is gone with it.
      // 32px of ink gap above: related to the verdict — its footer — where
      // the 48px above that is the image-to-text break.
      const ctaBaseline = vInkBottom + verdictToUrl + ctaInk.asc;
      // FLAT ritual green, no glow: the lit voice on this card is the meta
      // bar's State Blue, and the URL is the quieter fact.
      const rootStyle = getComputedStyle(document.documentElement);
      const ritualGreen = `hsl(${rootStyle.getPropertyValue("--ritual-green").trim()})`;
      setLS("2px");
      ctx.font = ctaFont;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillStyle = ritualGreen;
      ctx.fillText("confess at theboothrecord.com", inset, ctaBaseline);
      setLS("0px");

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
    // AND NOT IN THE ROOM. "AS CHARGED AT X" is a claim about where something
    // happened, and a session that arrived by ?source= alone was never at X:
    // YOUR TURN on a shared card, an Instagram link, any inbound that carries
    // attribution but not a printed card. isPhysicalScan() is exactly that
    // distinction and has been recorded per row since the physical-flag
    // migration — this is the first thing to read it. Applied HERE, after the
    // fallback block above, because that block reassigns `suppress` from the
    // refetched row and would overwrite it.
    // SOURCE IS UNTOUCHED: the venue still gets the scan, the share, the
    // confession and the next YOUR TURN. It just stops getting the stamp.
    // (The row-level half of this lives in tag_confession — /v/:id and the OG
    // image read stamp_venue off the row, not this session.)
    return { uuid, filedVenue: await computeFiledVenue(suppress || !isPhysicalScan()) };
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
    "type-action text-foreground/80 underline underline-offset-4 hover:text-foreground transition-colors tracking-wide";
  // SEE THE RECORD pre-share — quiet exit, one step above the 11px action scale
  // but still muted and boxless so it never competes with the share action
  // (sharing is the perishable one). Post-share it's promoted to the boxed
  // primary instead, at the same 13px.
  const wallLink =
    "type-action text-muted-foreground hover:text-foreground transition-colors tracking-wide";

  return (
    // KIOSK CENTRING: screen-container's pb-32 exists to clear the phone's
    // fixed action block, which the booth doesn't have — on a tablet it left
    // the record 306px from the top and 128px from the bottom, off-centre and
    // sitting low. In kiosk the bottom padding drops to match the top and the
    // container centres its children as one block instead of letting the
    // content stretch. min-h (not h) keeps it safe on a phone: taller content
    // just grows the container and the page scrolls, never clipping the top.
    <div className={`screen-container animate-fade-in${kiosk ? " pb-8 justify-center" : ""}`}>
      {/* pb-8 in kiosk: with the action wrapper's pt-6 also dropped below, the
          verdict-to-SUBJECT # gap lands at 56px (24 from the verdict's own mb-6
          + 32 here). It was 88 — the record and the handoff read as two
          unrelated screens stacked on one. */}
      <div
        className={`${kiosk ? "" : "flex-1 "}flex flex-col justify-center items-start text-left ${
          kiosk ? "pb-8" : "pb-10"
        }`}
      >
        {/* System stamp, not a headline — smallest text on the screen. 12px below,
            matching the share page: stamp + confession read as one block. */}
        <p className="text-ritual type-filing font-mono-light tracking-[0.2em] mb-3 min-h-[1em] relative">
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
          <p className="text-muted-foreground type-confession font-mono-light leading-relaxed tracking-wide mb-8 max-w-[600px] whitespace-pre-line">
            {confession}
          </p>
        )}

        <div className="font-control type-verdict font-bold text-foreground mb-6 whitespace-pre-line">
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
      <div
        className={`shrink-0 w-full ${kiosk ? "pt-0" : "pt-6"} flex flex-col items-center gap-6`}
      >
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

        {kiosk ? (
          /* ── KIOSK HANDOFF. The booth's device replaces every action with one
             QR: SHARE VERDICT, POST TO STORY, CONFESS AGAIN and SEE THE RECORD
             are all phone actions — they'd hand the venue's hardware to a
             stranger, open the booth's own camera, or walk the booth away from
             the gate. The QR is the only way the record leaves the room.
             All three states reserve the SAME height, so the screen never
             jumps between resolving and resolved — on a booth the movement is
             the only thing anyone would notice. */
          /* NO max-w-xs on this group: the QR below is sized as a PERCENTAGE
             OF THE COLUMN, and a 320px cap here would have quietly made it a
             percentage of 320 instead of the ~400px the record is set in.
             gap-[18px] = the spacing inside the group, the reveal card's own
             rhythm; the 56px above it comes off the record block's own padding
             (see the content div's pb). */
          <div className="w-full flex flex-col items-center gap-[18px]">
            {/* CONFESSOR #N — kiosk only, between the verdict and the QR, and
                now in the SAME treatment as the line below the code and as
                CONFESSOR N on the reveal card: this is a pair that brackets a
                code in a dark room, not a footnote on a document. It was the
                11px filing tier, which was the right call while the line under
                the code was 11px too; with that line at 22px the small one read
                as leftover rather than as the other half of anything.
                It keeps the NUMBER because this is the only place a person sees
                their filing reference — it is what they look for on the wall,
                where records are labelled "#1121". The # is also what separates
                it from the reveal card's CONFESSOR N, which counts people in a
                round rather than records in the register. */}
            {subjectNumber ? (
              <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
                Confessor #{subjectNumber}
              </p>
            ) : null}
            {/* 55% OF THE COLUMN. min(40vw, 320px) was pinned at 320px on every
                tablet — 80% of a 400px column, which made the code the largest
                object on a screen whose subject is a sentence. A percentage of
                the column lands the same proportion on both devices (220px on
                the booth, 180px on a phone, where it GROWS from 46%). Height
                from aspect-ratio, not a percentage: a percentage height would
                resolve against an auto-height parent. All three states reserve
                identical space, so nothing jumps as the code resolves. */}
            <div
              className="flex items-center justify-center"
              style={{ width: "clamp(180px, 34vw, 400px)", aspectRatio: "1 / 1" }}
            >
              {qr.state === "ready" ? (
                <img
                  src={qr.dataUrl}
                  alt="Scan to open this verdict"
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <p className="max-w-xs text-muted-foreground/60 text-[13px] font-mono-light tracking-wide text-center">
                  {qr.state === "resolving"
                    ? "FILING…"
                    : /* Failed: a FLAT TECHNICAL line and nothing else. No
                         toast, no retry — a retry button on a booth is a
                         button the next person inherits. The copy is
                         deliberately mechanical: the earlier "This one stays
                         in the booth." read as a judgment on the confession
                         and sat too close to Blocked's "This one stays off the
                         record." A failed uuid lookup is a broken link, not a
                         verdict, and pointing at a human is the only useful
                         thing the screen can do. */
                      "Couldn't make the link. Ask at the bar."}
                </p>
              )}
            </div>
            {/* BELOW the code, not above it: the line describes the code, and
                sitting under SUBJECT #N it read as an instruction about the
                number — the one thing on this screen you can't take with you.
                IDENTICAL TO THE REVEAL CARD'S (see RoundReveal): same room,
                same light, same job — notice the code and take it. It was
                11.5px lowercase grey here and 22px uppercase State Blue two
                screens away, which made the solo booth quieter than the group
                one for no reason anybody in the room could have named. The
                earlier argument for lowercase — that Söhne Mono is the app's
                human voice and caps read as signage — loses to the room: this
                IS signage, read at table distance in the dark, and it is the
                last thing standing between a verdict and the phone that
                carries it out.
                SUBJECT #N above the code KEEPS the filing tier: it is a
                reference number, not an instruction, and it is not the same
                object as the reveal card's CONFESSOR N. */}
            <p className="venue-glow-text type-handoff font-mono-light tracking-[0.18em] uppercase">
              Take it with you
            </p>
          </div>
        ) : (
          <>
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
              className="btn-booth border border-muted-foreground/40 bg-transparent type-action hover:bg-transparent disabled:opacity-50"
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
              className="btn-booth border border-muted-foreground/40 bg-transparent type-action-14 text-center hover:bg-transparent"
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
          </>
        )}
      </div>
      <KioskIdleLine secondsLeft={idleLeft} />
      <KioskStaffReset />

      {/* ── POST TO STORY photo flow (see the story state note). Full-screen
          overlay: choose → crop → preview. skip at the bottom of choose runs
          the old single-tap path — today's card, byte for byte. */}
      {/* iOS SAFARI FIX (confirmed on a real phone): with `inset-0` alone
          the overlay sizes to the LARGE viewport (toolbar hidden), so its
          bottom controls — chooser's skip, crop's back, preview's RETAKE —
          sat under Safari's bottom toolbar with no visible way out of the
          flow. height:100dvh sizes to the DYNAMIC viewport (ends above the
          toolbar; the top:0 of inset-0 + explicit height wins over bottom:0,
          and browsers without dvh, pre-2022, ignore the invalid height and
          fall back to inset-0). The safe-area inset handles the home
          indicator once the toolbar minimises. screen-container already does
          both (100dvh + pb-32); this overlay was the one unprotected
          container in the flow. */}
      {/* NEVER in kiosk: the chooser's TAKE A PHOTO opens the BOOTH'S camera,
          pointed at whatever the booth is pointed at, and "or pick one" opens
          the booth's library. Both are the wrong device and the wrong person's
          photos. The kiosk branch above renders no entry point to this flow;
          this gate is the second layer. */}
      {story && !kiosk ? (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col items-center px-6 pt-10 overflow-hidden animate-fade-in"
          style={{
            height: "100dvh",
            paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
          }}
        >
          {story.step === "choose" ? (
            <>
              <div className="flex-1 w-full max-w-xs flex flex-col items-center justify-center gap-5">
                {/* Framing caption (THE PRIMARY-ACTION RULE): the evidence
                    register — the photo is exhibit material, same voice as
                    AS CHARGED. Replaced "WHERE IT HAPPENED." (a statement
                    about the place; this is an instruction to the confessor),
                    which itself replaced "THE ROOM, NOT YOUR DINNER" (assumed
                    a restaurant, and was framing advice). */}
                <p className="text-muted-foreground text-[11px] font-mono-light tracking-wide text-center">
                  GET THE EVIDENCE
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
